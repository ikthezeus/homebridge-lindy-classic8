'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LindyOutletAccessory, LindyAllCycleAccessory } = require('../lib/accessory');

function buildMocks() {
  const infoValues = new Map();
  const serviceValues = new Map();
  const info = {
    setCharacteristic(characteristic, value) {
      infoValues.set(characteristic, value);
      return this;
    },
  };
  const switchService = {
    setCharacteristic(characteristic, value) {
      serviceValues.set(characteristic, value);
      return this;
    },
    getCharacteristic() {
      return {
        onGet() { return this; },
        onSet() { return this; },
      };
    },
    updateCharacteristic() {},
  };
  const platform = {
    config: {
      host: '192.168.1.50',
      exposeOutletSwitches: false,
      exposeCycleSwitches: true,
      cyclePrefix: 'Power Cycle',
      cycleDelaySeconds: 1,
      allCycleName: 'Power Cycle Everything',
      allCycleStepSeconds: 1,
    },
    deviceInfo: {},
    Service: { AccessoryInformation: 'AccessoryInformation', Switch: 'Switch' },
    Characteristic: {
      Name: 'Name', Manufacturer: 'Manufacturer', Model: 'Model', SerialNumber: 'SerialNumber',
      FirmwareRevision: 'FirmwareRevision', On: 'On',
    },
    client: {},
    log: { info() {}, warn() {}, error() {} },
  };
  const accessory = {
    context: {},
    getService(type) {
      assert.equal(type, 'AccessoryInformation');
      return info;
    },
    getServiceById() { return undefined; },
    addService() { return switchService; },
    removeService() {},
  };
  return { platform, accessory, infoValues };
}

test('outlet Accessory Information Name uses the power-cycle action name', () => {
  const { platform, accessory, infoValues } = buildMocks();
  new LindyOutletAccessory(platform, accessory, { number: 7, name: 'Hue Bridge' });
  assert.equal(infoValues.get('Name'), 'Power Cycle Hue Bridge');
});

test('outlet Accessory Information Name stays synchronised after a rename', () => {
  const { platform, accessory, infoValues } = buildMocks();
  const handler = new LindyOutletAccessory(platform, accessory, { number: 3, name: 'Rack Fans' });
  handler.updateName('Rack Cooling');
  assert.equal(infoValues.get('Name'), 'Power Cycle Rack Cooling');
});

test('all-cycle Accessory Information Name is explicit', () => {
  const { platform, accessory, infoValues } = buildMocks();
  new LindyAllCycleAccessory(platform, accessory);
  assert.equal(infoValues.get('Name'), 'Power Cycle Everything');
});
