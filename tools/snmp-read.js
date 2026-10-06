#!/usr/bin/env node
'use strict';

const snmp = require('net-snmp');
const { OIDS, OUTLET_COUNT, parseStates, parseOutletName, bufferToString } = require('../lib/protocol');

const host = process.argv[2];
const community = process.argv[3] || 'public';

if (!host) {
  console.error('Usage: node tools/snmp-read.js <host-or-ip> [read-community]');
  process.exit(2);
}

const session = snmp.createSession(host, community, {
  version: snmp.Version1,
  port: 161,
  timeout: 3000,
  retries: 1,
  transport: 'udp4',
});

const oids = [OIDS.sysObjectId, OIDS.model, OIDS.pduName, OIDS.states];
for (let i = 1; i <= OUTLET_COUNT; i += 1) {
  oids.push(OIDS.outletName(i));
}

session.get(oids, (error, varbinds) => {
  try {
    if (error) {
      throw error;
    }
    for (const varbind of varbinds) {
      if (snmp.isVarbindError(varbind)) {
        throw new Error(snmp.varbindError(varbind));
      }
    }

    const sysObjectId = bufferToString(varbinds[0].value);
    const model = bufferToString(varbinds[1].value);
    const pduName = bufferToString(varbinds[2].value);
    const states = parseStates(varbinds[3].value);

    console.log(`Device: ${pduName || 'Classic8'}${model ? ` (${model})` : ''}`);
    console.log(`sysObjectID: ${sysObjectId}`);
    console.log('');

    for (let i = 0; i < OUTLET_COUNT; i += 1) {
      const name = parseOutletName(varbinds[4 + i].value, `Outlet ${String.fromCharCode(65 + i)}`);
      const state = states[i] === 1 ? 'ON' : states[i] === 0 ? 'OFF' : `STATE ${states[i]}`;
      console.log(`${i + 1}: ${name} - ${state}`);
    }
  } catch (err) {
    console.error(`Failed: ${err.message || err}`);
    process.exitCode = 1;
  } finally {
    session.close();
  }
});
