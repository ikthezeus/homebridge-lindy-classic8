'use strict';

const OUTLET_COUNT = 8;
const OIDS = Object.freeze({
  sysObjectId: '1.3.6.1.2.1.1.2.0',
  states: '1.3.6.1.4.1.17420.1.2.9.1.13.0',
  model: '1.3.6.1.4.1.17420.1.2.9.1.19.0',
  pduName: '1.3.6.1.4.1.17420.1.2.9.1.20.0',
  onDelays: '1.3.6.1.4.1.17420.1.2.9.1.21.0',
  offDelays: '1.3.6.1.4.1.17420.1.2.9.1.22.0',
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

function parseDelayList(value) {
  const raw = bufferToString(value);
  const parts = raw.split(',').map((part) => Number.parseInt(part.trim(), 10));
  const delays = parts.slice(0, OUTLET_COUNT);

  if (delays.length !== OUTLET_COUNT || delays.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    throw new Error(`Unexpected Classic8 delay string: "${raw}"`);
  }

  return delays;
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

function buildNativeCycleMask(outletNumbers) {
  if (!Array.isArray(outletNumbers) || outletNumbers.length === 0) {
    throw new Error('At least one outlet is required for a native power cycle.');
  }

  const selected = new Set();
  for (const outletNumber of outletNumbers) {
    validateOutletNumber(outletNumber);
    selected.add(outletNumber);
  }

  const firstEight = [];
  for (let number = 1; number <= OUTLET_COUNT; number += 1) {
    firstEight.push(selected.has(number) ? '1' : '0');
  }

  // The Classic8 web UI appends two unused 8-bit groups to the selected
  // outlet bitmap before calling offon.cgi.
  return `${firstEight.join('')}0000000000000000`;
}

function buildIndividualDelayProfile(original, outletNumber, delaySeconds) {
  validateOutletNumber(outletNumber);
  validateDelayProfile(original);
  const delay = validateDelaySeconds(delaySeconds, 1, 255);

  const on = original.on.slice();
  const off = original.off.slice();
  on[outletNumber - 1] = delay;
  off[outletNumber - 1] = delay;
  return { on, off };
}

function buildSequentialAllDelayProfile(stepSeconds) {
  const step = validateDelaySeconds(stepSeconds, 1, 31);
  return {
    // Outlet N goes off at N * step seconds.
    off: Array.from({ length: OUTLET_COUNT }, (_, index) => (index + 1) * step),
    // Every outlet waits 8 * step seconds after its own OFF event before
    // turning back on. This yields 1..8 OFF, then 1..8 ON with equal spacing.
    on: new Array(OUTLET_COUNT).fill(OUTLET_COUNT * step),
  };
}

function delayProfileToStrings(profile) {
  validateDelayProfile(profile);
  return {
    on: profile.on.join(','),
    off: profile.off.join(','),
  };
}

function validateDelayProfile(profile) {
  for (const key of ['on', 'off']) {
    if (!Array.isArray(profile?.[key]) || profile[key].length !== OUTLET_COUNT) {
      throw new Error(`Classic8 ${key.toUpperCase()} delay profile must contain eight values.`);
    }
    for (const value of profile[key]) {
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error(`Classic8 ${key.toUpperCase()} delay values must be integers from 0 to 255.`);
      }
    }
  }
}

function validateDelaySeconds(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`Delay must be an integer between ${min} and ${max} seconds.`);
  }
  return parsed;
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
  parseDelayList,
  stateToBoolean,
  parseOutletName,
  buildTargetedPayload,
  buildReadModifyWritePayload,
  buildNativeCycleMask,
  buildIndividualDelayProfile,
  buildSequentialAllDelayProfile,
  delayProfileToStrings,
  validateDelayProfile,
  validateOutletNumber,
};
