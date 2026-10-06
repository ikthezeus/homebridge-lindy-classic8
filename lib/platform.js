'use strict';

const path = require('path');
const { LindyClassic8Client } = require('./lindy-client');
const { LindyOutletAccessory, LindyAllCycleAccessory } = require('./accessory');
const { OUTLET_COUNT } = require('./protocol');
const { PLATFORM_NAME, PLUGIN_NAME } = require('./settings');
const { outletAccessoryDisplayName } = require('./naming');

class LindyClassic8Platform {
  constructor(log, config, api) {
    this.log = log;
    this.config = this.normaliseConfig(config || {});
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.cachedAccessories = new Map();
    this.outletAccessories = new Map();
    this.cachedAllAccessory = undefined;
    this.allAccessoryHandler = undefined;
    this.pollTimer = undefined;
    this.client = undefined;
    this.deviceInfo = undefined;

    if (!this.config.host) {
      this.log.error('No Classic8 host/IP has been configured. The plugin will not start.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      void this.start();
    });

    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
      this.client?.close();
    });
  }

  normaliseConfig(config) {
    return {
      ...config,
      name: config.name || 'Lindy Classic8',
      port: clampInteger(config.port, 1, 65535, 161),
      readCommunity: config.readCommunity || 'public',
      writeCommunity: config.writeCommunity || config.readCommunity || 'public',
      timeout: clampInteger(config.timeout, 500, 30000, 3000),
      retries: clampInteger(config.retries, 0, 5, 1),
      pollIntervalSeconds: clampInteger(config.pollIntervalSeconds, 5, 3600, 15),
      cycleDelaySeconds: clampInteger(config.cycleDelaySeconds, 1, 255, 1),
      cyclePrefix: config.cyclePrefix || 'Power Cycle',
      exposeCycleSwitches: config.exposeCycleSwitches !== false,
      exposeOutletSwitches: config.exposeOutletSwitches === true,
      exposeAllCycleSwitch: config.exposeAllCycleSwitch !== false,
      allCycleName: config.allCycleName || 'Power Cycle Everything',
      allCycleStepSeconds: clampInteger(config.allCycleStepSeconds, 1, 31, 1),
      webPort: clampInteger(config.webPort, 1, 65535, 80),
      webUsername: config.webUsername || 'snmp',
      webPassword: config.webPassword || '',
      httpTimeout: clampInteger(config.httpTimeout, 1000, 30000, 5000),
      outlets: Array.isArray(config.outlets) ? config.outlets : [],
    };
  }

  configureAccessory(accessory) {
    if (accessory.context?.allCycle === true) {
      this.cachedAllAccessory = accessory;
      return;
    }

    const number = accessory.context?.outletNumber;
    if (Number.isInteger(number)) {
      this.cachedAccessories.set(number, accessory);
    }
  }

  async start() {
    const stateFile = path.join(
      this.api.user.storagePath(),
      `lindy-classic8-${String(this.config.host).replace(/[^a-zA-Z0-9_.-]/g, '_')}-recovery.json`,
    );

    this.client = new LindyClassic8Client({
      host: this.config.host,
      port: this.config.port,
      readCommunity: this.config.readCommunity,
      writeCommunity: this.config.writeCommunity,
      timeout: this.config.timeout,
      retries: this.config.retries,
      webPort: this.config.webPort,
      webUsername: this.config.webUsername,
      webPassword: this.config.webPassword,
      httpTimeout: this.config.httpTimeout,
      stateFile,
    }, this.log);

    try {
      await this.client.recoverPendingDelays();
    } catch (error) {
      this.log.warn(`A Classic8 delay-profile recovery is still pending: ${error.message || error}`);
      this.client.scheduleRestore(10000);
    }

    if (this.config.exposeCycleSwitches && !this.config.webPassword) {
      this.log.error(
        'webPassword is not configured. Power Cycle switches will be visible but cannot execute until the Classic8 web password is added.',
      );
    }

    let discoveredNames;

    try {
      discoveredNames = await this.client.getOutletNames();
    } catch (error) {
      this.log.error(`Could not read Classic8 outlet names at startup: ${error.message || error}`);
      this.log.warn('Accessories will still be created using configured/fallback names and will recover when the PDU becomes reachable.');
      discoveredNames = Array.from({ length: OUTLET_COUNT }, (_, index) => `Outlet ${String.fromCharCode(65 + index)}`);
    }

    try {
      const identity = await this.client.identify();
      this.deviceInfo = identity;

      if (identity.sysObjectId && !identity.sysObjectId.includes('1.3.6.1.4.1.17420')) {
        this.log.warn(`The device at ${this.config.host} reports sysObjectID ${identity.sysObjectId}; expected enterprise 17420.`);
      }

      this.log.info(
        `Connected to ${identity.pduName || 'Lindy Classic8'}${identity.model ? ` (${identity.model})` : ''} at ${this.config.host}.`,
      );
    } catch (error) {
      this.log.warn(`Classic8 identity query failed, but outlet control can still work: ${error.message || error}`);
    }

    this.syncAccessories(discoveredNames);
    this.syncAllCycleAccessory();
    await this.poll().catch(() => undefined);

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.config.pollIntervalSeconds * 1000);
    this.pollTimer.unref?.();
  }

  desiredOutlets(discoveredNames) {
    const overrides = new Map();
    for (const entry of this.config.outlets) {
      const number = Number(entry?.number);
      if (Number.isInteger(number) && number >= 1 && number <= OUTLET_COUNT) {
        overrides.set(number, entry);
      }
    }

    const desired = [];

    for (let number = 1; number <= OUTLET_COUNT; number += 1) {
      const override = overrides.get(number);
      if (override?.enabled === false) {
        continue;
      }

      desired.push({
        number,
        name: String(override?.name || discoveredNames[number - 1] || `Outlet ${String.fromCharCode(64 + number)}`).trim(),
        cycleDelaySeconds: override?.cycleDelaySeconds === undefined
          ? undefined
          : clampInteger(override.cycleDelaySeconds, 1, 255, this.config.cycleDelaySeconds),
      });
    }

    return desired;
  }

  syncAccessories(discoveredNames) {
    const desired = this.desiredOutlets(discoveredNames);
    const desiredNumbers = new Set(desired.map((outlet) => outlet.number));

    for (const outlet of desired) {
      const uuid = this.api.hap.uuid.generate(`lindy-classic8:${this.config.host}:outlet:${outlet.number}`);
      const displayName = outletAccessoryDisplayName(this.config, outlet.name);
      let accessory = this.cachedAccessories.get(outlet.number);

      if (!accessory) {
        accessory = new this.api.platformAccessory(displayName, uuid);
        accessory.context.outletNumber = outlet.number;
        accessory.context.outletName = outlet.name;
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.cachedAccessories.set(outlet.number, accessory);
        this.log.info(`Added HomeKit accessory for outlet ${outlet.number}: "${displayName}".`);
      } else if (accessory.displayName !== displayName) {
        // The bridged accessory name is what Apple Home proposes during the
        // initial pairing flow. Keep cached accessories in sync too so an
        // upgrade from an older plugin version does not keep offering the raw
        // PDU outlet name (for example "Hue Bridge") instead of the safer
        // action name ("Power Cycle Hue Bridge").
        accessory.updateDisplayName(displayName);
        this.api.updatePlatformAccessories([accessory]);
        this.log.info(`Updated HomeKit accessory name for outlet ${outlet.number}: "${displayName}".`);
      }

      const handler = new LindyOutletAccessory(this, accessory, outlet);
      handler.updateName(outlet.name);
      this.outletAccessories.set(outlet.number, handler);
    }

    const stale = [];
    for (const [number, accessory] of this.cachedAccessories.entries()) {
      if (!desiredNumbers.has(number)) {
        stale.push(accessory);
        this.cachedAccessories.delete(number);
        this.outletAccessories.delete(number);
      }
    }

    if (stale.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      this.log.info(`Removed ${stale.length} Classic8 outlet accessory/accessories no longer selected in config.`);
    }
  }

  syncAllCycleAccessory() {
    if (!this.config.exposeAllCycleSwitch) {
      if (this.cachedAllAccessory) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cachedAllAccessory]);
        this.cachedAllAccessory = undefined;
        this.allAccessoryHandler = undefined;
      }
      return;
    }

    const uuid = this.api.hap.uuid.generate(`lindy-classic8:${this.config.host}:cycle-all`);
    let accessory = this.cachedAllAccessory;
    if (!accessory) {
      accessory = new this.api.platformAccessory(this.config.allCycleName, uuid);
      accessory.context.allCycle = true;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cachedAllAccessory = accessory;
      this.log.info(`Added HomeKit accessory "${this.config.allCycleName}".`);
    }

    this.allAccessoryHandler = new LindyAllCycleAccessory(this, accessory);
  }

  async poll() {
    if (!this.client) {
      return;
    }

    try {
      const states = await this.client.getOutletStates();
      for (const [number, handler] of this.outletAccessories.entries()) {
        const raw = states[number - 1];
        const state = raw === 1 ? true : raw === 0 ? false : null;
        if (state !== null) {
          handler.updatePowerState(state);
        }
      }
      this.log.debug(`Classic8 outlet states: ${states.join(',')}`);
    } catch (error) {
      this.log.warn(`Classic8 poll failed: ${error.message || error}`);
      for (const handler of this.outletAccessories.values()) {
        handler.markFaulted();
      }
    }
  }
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

module.exports = {
  LindyClassic8Platform,
};
