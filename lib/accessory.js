'use strict';

class LindyOutletAccessory {
  constructor(platform, accessory, outlet) {
    this.platform = platform;
    this.accessory = accessory;
    this.outlet = outlet;
    this.cycling = false;
    this.lastKnownState = null;

    this.accessory.context.outletNumber = outlet.number;
    this.accessory.context.outletName = outlet.name;

    this.configureInformation();
    this.configureServices();
  }

  configureInformation() {
    const info = this.accessory.getService(this.platform.Service.AccessoryInformation);
    info
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Lindy')
      .setCharacteristic(this.platform.Characteristic.Model, 'IPower Switch Classic 8 (32657)')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.platform.config.host}-${this.outlet.number}`)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.platform.deviceInfo?.firmware || 'Unknown');
  }

  configureServices() {
    const powerSubtype = `power-${this.outlet.number}`;
    const cycleSubtype = `cycle-${this.outlet.number}`;

    let powerService = this.accessory.getServiceById(this.platform.Service.Switch, powerSubtype);
    let cycleService = this.accessory.getServiceById(this.platform.Service.Switch, cycleSubtype);

    if (this.platform.config.exposeOutletSwitches) {
      powerService = powerService || this.accessory.addService(
        this.platform.Service.Switch,
        this.outlet.name,
        powerSubtype,
      );

      setServiceName(this.platform, powerService, this.outlet.name);

      powerService.getCharacteristic(this.platform.Characteristic.On)
        .onGet(async () => {
          const state = await this.platform.client.getOutletState(this.outlet.number);
          if (state === null) {
            throw new Error(`Outlet ${this.outlet.number} is unavailable or reports a power fault.`);
          }
          this.lastKnownState = state;
          return state;
        })
        .onSet(async (value) => {
          const desired = Boolean(value);
          await this.platform.client.setOutlet(this.outlet.number, desired);
          this.lastKnownState = desired;
          this.updatePowerState(desired);
        });
    } else if (powerService) {
      this.accessory.removeService(powerService);
      powerService = undefined;
    }

    this.powerService = powerService;

    if (this.platform.config.exposeCycleSwitches !== false) {
      const cycleName = `${this.platform.config.cyclePrefix || 'Power Cycle'} ${this.outlet.name}`;
      cycleService = cycleService || this.accessory.addService(
        this.platform.Service.Switch,
        cycleName,
        cycleSubtype,
      );

      setServiceName(this.platform, cycleService, cycleName);

      cycleService.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.cycling)
        .onSet((value) => {
          if (!Boolean(value) || this.cycling) {
            return;
          }

          // Return the HAP request immediately. The PDU owns the complete
          // OFF/ON operation, so Homebridge may legitimately disappear when
          // the NAS or network infrastructure is the selected outlet.
          void this.runCycle(cycleService);
        });
    } else if (cycleService) {
      this.accessory.removeService(cycleService);
      cycleService = undefined;
    }

    this.cycleService = cycleService;
  }

  async runCycle(cycleService) {
    if (this.cycling) {
      return;
    }

    this.cycling = true;
    cycleService.updateCharacteristic(this.platform.Characteristic.On, true);

    try {
      const delaySeconds = this.outlet.cycleDelaySeconds ?? this.platform.config.cycleDelaySeconds;
      this.platform.log.info(
        `Requesting native power cycle for "${this.outlet.name}" on outlet ${this.outlet.number} (${delaySeconds}s).`,
      );
      await this.platform.client.cycleOutlet(this.outlet.number, delaySeconds);
      this.platform.log.info(`Classic8 accepted the power-cycle command for "${this.outlet.name}".`);
    } catch (error) {
      this.platform.log.error(`Power cycle failed for "${this.outlet.name}": ${error.message || error}`);
    } finally {
      this.cycling = false;
      cycleService.updateCharacteristic(this.platform.Characteristic.On, false);
    }
  }

  updateName(name) {
    this.outlet.name = name;
    this.accessory.context.outletName = name;

    if (this.powerService) {
      setServiceName(this.platform, this.powerService, name);
    }

    if (this.cycleService) {
      const cycleName = `${this.platform.config.cyclePrefix || 'Power Cycle'} ${name}`;
      setServiceName(this.platform, this.cycleService, cycleName);
    }
  }

  updatePowerState(state) {
    this.lastKnownState = state;
    if (this.powerService && typeof state === 'boolean') {
      this.powerService.updateCharacteristic(this.platform.Characteristic.On, state);
    }
  }

  markFaulted() {
    // Errors are surfaced through onGet/onSet and logs.
  }
}

class LindyAllCycleAccessory {
  constructor(platform, accessory) {
    this.platform = platform;
    this.accessory = accessory;
    this.cycling = false;
    this.configureInformation();
    this.configureService();
  }

  configureInformation() {
    const info = this.accessory.getService(this.platform.Service.AccessoryInformation);
    info
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Lindy')
      .setCharacteristic(this.platform.Characteristic.Model, 'IPower Switch Classic 8 (32657)')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.platform.config.host}-all-cycle`);
  }

  configureService() {
    const name = this.platform.config.allCycleName || 'Power Cycle Everything';
    const subtype = 'cycle-all';
    let service = this.accessory.getServiceById(this.platform.Service.Switch, subtype);
    service = service || this.accessory.addService(this.platform.Service.Switch, name, subtype);
    setServiceName(this.platform, service, name);

    service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.cycling)
      .onSet((value) => {
        if (!Boolean(value) || this.cycling) {
          return;
        }
        void this.runCycle(service);
      });

    this.service = service;
  }

  async runCycle(service) {
    if (this.cycling) {
      return;
    }

    this.cycling = true;
    service.updateCharacteristic(this.platform.Characteristic.On, true);

    try {
      const step = this.platform.config.allCycleStepSeconds;
      this.platform.log.warn(
        `Requesting Power Cycle Everything: outlets 1-8 OFF every ${step}s, then ON in the same order.`,
      );
      await this.platform.client.cycleAllSequential(step);
      this.platform.log.warn('Classic8 accepted the Power Cycle Everything command. Homebridge/network connectivity may now drop temporarily.');
    } catch (error) {
      this.platform.log.error(`Power Cycle Everything failed: ${error.message || error}`);
    } finally {
      this.cycling = false;
      service.updateCharacteristic(this.platform.Characteristic.On, false);
    }
  }
}

function setServiceName(platform, service, name) {
  // Switch services do not define ConfiguredName in HAP. Setting it causes
  // Homebridge 2.x to warn that a non-supported characteristic was added.
  // Characteristic.Name is the correct service-level display name here.
  service.setCharacteristic(platform.Characteristic.Name, name);
}

module.exports = {
  LindyOutletAccessory,
  LindyAllCycleAccessory,
};
