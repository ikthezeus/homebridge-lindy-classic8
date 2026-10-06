'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseStates,
  parseOutletName,
  buildTargetedPayload,
  buildReadModifyWritePayload,
} = require('../lib/protocol');

test('parseStates reads eight Classic8 states', () => {
  assert.deepEqual(parseStates(Buffer.from('1,0,1,1,0,0,1,0')), [1, 0, 1, 1, 0, 0, 1, 0]);
});

test('parseOutletName strips the Classic8 config fields', () => {
  assert.equal(parseOutletName(Buffer.from('Router,0,0,0,0'), 'Outlet A'), 'Router');
});

test('targeted payload changes only one outlet', () => {
  assert.equal(buildTargetedPayload(3, false), '5,5,0,5,5,5,5,5');
  assert.equal(buildTargetedPayload(8, true), '5,5,5,5,5,5,5,1');
});

test('read-modify-write payload preserves all other states', () => {
  assert.equal(
    buildReadModifyWritePayload([1, 1, 1, 0, 1, 0, 1, 1], 4, true),
    '1,1,1,1,1,0,1,1',
  );
});
