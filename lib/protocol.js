'use strict';

const OUTLET_COUNT = 8;
const OIDS = Object.freeze({
  sysObjectId: '1.3.6.1.2.1.1.2.0',
  states: '1.3.6.1.4.1.17420.1.2.9.1.13.0',
  model: '1.3.6.1.4.1.17420.1.2.9.1.19.0',
  pduName: '1.3.6.1.4.1.17420.1.2.9.1.20.0',
  outletName: (number) => `1.3.6.1.4.1.17420.1.2.9.1.14.${number}.0`,
});

function bufferToString(value) {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8').replace(/\0+$/g, '').trim();
  }
  return String(value ?? '').replace(/\0+$/g, '').trim();
}

function parseStates(value) {
  const raw = bufferToString(value);
  const parts = raw.split(',').map((part) => Number.parseInt(part.trim(), 10));

  if (parts.length < OUTLET_COUNT || parts.slice(0, OUTLET_COUNT).some(Number.isNaN)) {
    throw new Error(`Unexpected Classic8 outlet state string: "${raw}"`);
  }

  return parts.slice(0, OUTLET_COUNT);
}

function stateToBoolean(state) {
  if (state === 1) {
    return true;
  }
  if (state === 0) {
    return false;
  }
  return null;
}

function parseOutletName(value, fallback) {
  const raw = bufferToString(value);
  const firstField = raw.split(',')[0].trim();
  return firstField || fallback;
}

function buildTargetedPayload(outletNumber, on) {
  validateOutletNumber(outletNumber);
  const values = new Array(OUTLET_COUNT).fill('5');
  values[outletNumber - 1] = on ? '1' : '0';
  return values.join(',');
}

function buildReadModifyWritePayload(states, outletNumber, on) {
  validateOutletNumber(outletNumber);
  if (!Array.isArray(states) || states.length < OUTLET_COUNT) {
    throw new Error('Eight outlet states are required for read-modify-write.');
  }

  const values = states.slice(0, OUTLET_COUNT).map((state) => String(state));
  values[outletNumber - 1] = on ? '1' : '0';
  return values.join(',');
}

function validateOutletNumber(outletNumber) {
  if (!Number.isInteger(outletNumber) || outletNumber < 1 || outletNumber > OUTLET_COUNT) {
    throw new RangeError(`Outlet number must be between 1 and ${OUTLET_COUNT}.`);
  }
}

module.exports = {
  OUTLET_COUNT,
  OIDS,
  bufferToString,
  parseStates,
  stateToBoolean,
  parseOutletName,
  buildTargetedPayload,
  buildReadModifyWritePayload,
  validateOutletNumber,
};
