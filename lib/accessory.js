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
      const cycleName = `${this.platform.config.cyclePrefix || 'Restart'} ${this.outlet.name}`;
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

          // Return to HomeKit immediately rather than holding the HAP request
          // open for the entire off-time. This keeps long (for example 10 s+)
          // power-cycle delays from appearing as a HomeKit timeout.
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
      this.platform.log.info(`Restarting "${this.outlet.name}" on outlet ${this.outlet.number}.`);
      await this.platform.client.cycleOutlet(this.outlet.number, delaySeconds * 1000);
      this.lastKnownState = true;
      this.updatePowerState(true);
      this.platform.log.info(`Restart complete for "${this.outlet.name}".`);
    } catch (error) {
      this.platform.log.error(`Restart failed for "${this.outlet.name}": ${error.message || error}`);
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
      const cycleName = `${this.platform.config.cyclePrefix || 'Restart'} ${name}`;
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
    // No StatusFault characteristic is added to Switch because not all HomeKit
    // clients display it consistently. Errors are surfaced through onGet/onSet and logs.
  }
}

function setServiceName(platform, service, name) {
  service.setCharacteristic(platform.Characteristic.Name, name);
  if (platform.Characteristic.ConfiguredName) {
    service.setCharacteristic(platform.Characteristic.ConfiguredName, name);
  }
}

module.exports = {
  LindyOutletAccessory,
};
