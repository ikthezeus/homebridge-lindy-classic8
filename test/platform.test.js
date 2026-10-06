'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { outletAccessoryDisplayName } = require('../lib/naming');
const { LindyClassic8Platform } = require('../lib/platform');

test('cycle-only accessories use the Power Cycle action as their HomeKit accessory name', () => {
  assert.equal(
    outletAccessoryDisplayName({ exposeCycleSwitches: true, cyclePrefix: 'Power Cycle' }, 'Hue Bridge'),
    'Power Cycle Hue Bridge',
  );
});

test('custom cycle prefixes are reflected in the HomeKit accessory name', () => {
  assert.equal(
    outletAccessoryDisplayName({ exposeCycleSwitches: true, cyclePrefix: 'Restart' }, 'NAS'),
    'Restart NAS',
  );
});

test('raw outlet name is used when cycle switches are disabled', () => {
  assert.equal(
    outletAccessoryDisplayName({ exposeCycleSwitches: false, cyclePrefix: 'Power Cycle' }, 'Switch'),
    'Switch',
  );
});

test('platform does not schedule startup without a configured host', () => {
  const events = [];
  const errors = [];

  const api = {
    hap: {
      Service: {},
      Characteristic: {},
    },
    on(event) {
      events.push(event);
    },
  };

  const log = {
    error(message) { errors.push(message); },
    warn() {},
    info() {},
    debug() {},
  };

  new LindyClassic8Platform(log, {}, api);

  assert.deepEqual(events, []);
  assert.match(errors[0], /will not start/);
});

test('unexpected asynchronous startup failures are caught and logged', async () => {
  const handlers = new Map();
  const errors = [];

  const api = {
    hap: {
      Service: {},
      Characteristic: {},
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  };

  const log = {
    error(message) { errors.push(message); },
    warn() {},
    info() {},
    debug() {},
  };

  const platform = new LindyClassic8Platform(
    log,
    { host: '192.168.1.50' },
    api,
  );

  platform.start = async () => {
    throw new Error('synthetic startup failure');
  };

  handlers.get('didFinishLaunching')();

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    errors.at(-1),
    'Lindy Classic8 startup failed: synthetic startup failure',
  );
});
