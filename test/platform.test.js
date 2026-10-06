'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { outletAccessoryDisplayName } = require('../lib/naming');

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
