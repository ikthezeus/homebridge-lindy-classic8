'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseStates,
  parseDelayList,
  parseOutletName,
  buildTargetedPayload,
  buildReadModifyWritePayload,
  buildNativeCycleMask,
  buildIndividualDelayProfile,
  buildSequentialAllDelayProfile,
  delayProfileToStrings,
} = require('../lib/protocol');

test('parseStates reads eight Classic8 states', () => {
  assert.deepEqual(parseStates(Buffer.from('1,0,1,1,0,0,1,0')), [1, 0, 1, 1, 0, 0, 1, 0]);
});

test('parseDelayList reads the eight PDU delay values', () => {
  assert.deepEqual(parseDelayList(Buffer.from('1,2,3,4,5,6,7,8')), [1, 2, 3, 4, 5, 6, 7, 8]);
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

test('native OFF/ON mask matches the Classic8 web UI format', () => {
  assert.equal(buildNativeCycleMask([3]), '001000000000000000000000');
  assert.equal(buildNativeCycleMask([3, 7]), '001000100000000000000000');
  assert.equal(buildNativeCycleMask([1, 2, 3, 4, 5, 6, 7, 8]), '111111110000000000000000');
});

test('individual cycle changes only the selected outlet delay', () => {
  const original = {
    on: [1, 2, 3, 4, 5, 6, 7, 8],
    off: [1, 2, 3, 4, 5, 6, 7, 8],
  };
  assert.deepEqual(buildIndividualDelayProfile(original, 3, 1), {
    on: [1, 2, 1, 4, 5, 6, 7, 8],
    off: [1, 2, 1, 4, 5, 6, 7, 8],
  });
});

test('Power Cycle Everything profile gives 1-8 OFF then 1-8 ON', () => {
  const profile = buildSequentialAllDelayProfile(1);
  assert.deepEqual(profile.off, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(profile.on, [8, 8, 8, 8, 8, 8, 8, 8]);
  assert.deepEqual(delayProfileToStrings(profile), {
    on: '8,8,8,8,8,8,8,8',
    off: '1,2,3,4,5,6,7,8',
  });

  const events = [];
  for (let outlet = 1; outlet <= 8; outlet += 1) {
    const offAt = profile.off[outlet - 1];
    const onAt = offAt + profile.on[outlet - 1];
    events.push([offAt, `OFF${outlet}`], [onAt, `ON${outlet}`]);
  }
  events.sort((a, b) => a[0] - b[0]);
  assert.deepEqual(events.map((event) => event[1]), [
    'OFF1', 'OFF2', 'OFF3', 'OFF4', 'OFF5', 'OFF6', 'OFF7', 'OFF8',
    'ON1', 'ON2', 'ON3', 'ON4', 'ON5', 'ON6', 'ON7', 'ON8',
  ]);
});
