'use strict';

const snmp = require('net-snmp');
const {
  OUTLET_COUNT,
  OIDS,
  bufferToString,
  parseStates,
  stateToBoolean,
  parseOutletName,
  buildTargetedPayload,
  buildReadModifyWritePayload,
  validateOutletNumber,
} = require('./protocol');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class LindyClassic8Client {
  constructor(options, log) {
    this.host = options.host;
    this.port = options.port ?? 161;
    this.readCommunity = options.readCommunity || 'public';
    this.writeCommunity = options.writeCommunity || this.readCommunity;
    this.timeout = options.timeout ?? 3000;
    this.retries = options.retries ?? 1;
    this.verifyDelay = options.verifyDelay ?? 350;
    this.log = log;
    this.closed = false;
    this.writeQueue = Promise.resolve();

    const sessionOptions = {
      port: this.port,
      retries: this.retries,
      timeout: this.timeout,
      version: snmp.Version1,
      transport: 'udp4',
    };

    this.readSession = snmp.createSession(this.host, this.readCommunity, sessionOptions);
    this.writeSession = snmp.createSession(this.host, this.writeCommunity, sessionOptions);
  }

  async identify() {
    const values = await this.get([OIDS.sysObjectId, OIDS.model, OIDS.pduName]);
    return {
      sysObjectId: bufferToString(values[0]),
      model: bufferToString(values[1]),
      pduName: bufferToString(values[2]),
    };
  }

  async getOutletNames() {
    const oids = [];
    for (let number = 1; number <= OUTLET_COUNT; number += 1) {
      oids.push(OIDS.outletName(number));
    }

    const values = await this.get(oids);
    return values.map((value, index) => parseOutletName(value, `Outlet ${String.fromCharCode(65 + index)}`));
  }

  async getOutletStates() {
    const [value] = await this.get([OIDS.states]);
    return parseStates(value);
  }

  async getOutletState(outletNumber) {
    validateOutletNumber(outletNumber);
    const states = await this.getOutletStates();
    return stateToBoolean(states[outletNumber - 1]);
  }

  async setOutlet(outletNumber, on) {
    validateOutletNumber(outletNumber);
    return this.enqueueWrite(() => this.setOutletLocked(outletNumber, Boolean(on)));
  }

  async cycleOutlet(outletNumber, delayMs) {
    validateOutletNumber(outletNumber);
    const safeDelay = Math.max(500, Number(delayMs) || 5000);

    return this.enqueueWrite(async () => {
      this.log?.info?.(`Power cycling outlet ${outletNumber}: OFF for ${safeDelay / 1000}s, then ON.`);
      await this.setOutletLocked(outletNumber, false);
      await sleep(safeDelay);
      await this.setOutletLocked(outletNumber, true);
      return true;
    });
  }

  enqueueWrite(operation) {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  async setOutletLocked(outletNumber, on) {
    // DigiPower/Lindy firmware accepts 5 as "leave this outlet unchanged" on this
    // shared status OID. It is the safest way to alter one outlet without racing
    // another outlet. Some older firmware differs, so we verify and fall back to
    // read-modify-write automatically.
    const targetedPayload = buildTargetedPayload(outletNumber, on);
    await this.setOctetString(OIDS.states, targetedPayload);
    await sleep(this.verifyDelay);

    let observed = await this.getOutletState(outletNumber);
    if (observed === on) {
      return observed;
    }

    this.log?.warn?.(
      `Outlet ${outletNumber} did not change after targeted SNMP SET; trying Classic8 read-modify-write fallback.`,
    );

    const states = await this.getOutletStates();
    const fallbackPayload = buildReadModifyWritePayload(states, outletNumber, on);
    await this.setOctetString(OIDS.states, fallbackPayload);
    await sleep(this.verifyDelay);

    observed = await this.getOutletState(outletNumber);
    if (observed !== on) {
      const desired = on ? 'ON' : 'OFF';
      const actual = observed === null ? 'unavailable/fault' : (observed ? 'ON' : 'OFF');
      throw new Error(`Classic8 outlet ${outletNumber} failed to reach ${desired}; reported state is ${actual}.`);
    }

    return observed;
  }

  get(oids) {
    if (this.closed) {
      return Promise.reject(new Error('SNMP client is closed.'));
    }

    return new Promise((resolve, reject) => {
      this.readSession.get(oids, (error, varbinds) => {
        if (error) {
          reject(new Error(`SNMP GET failed for ${this.host}: ${error.message || error}`));
          return;
        }

        try {
          const values = varbinds.map((varbind) => {
            if (snmp.isVarbindError(varbind)) {
              throw new Error(snmp.varbindError(varbind));
            }
            return varbind.value;
          });
          resolve(values);
        } catch (err) {
          reject(new Error(`SNMP GET failed for ${this.host}: ${err.message || err}`));
        }
      });
    });
  }

  setOctetString(oid, value) {
    if (this.closed) {
      return Promise.reject(new Error('SNMP client is closed.'));
    }

    const varbinds = [{
      oid,
      type: snmp.ObjectType.OctetString,
      value,
    }];

    return new Promise((resolve, reject) => {
      this.writeSession.set(varbinds, (error, response) => {
        if (error) {
          reject(new Error(`SNMP SET failed for ${this.host}: ${error.message || error}`));
          return;
        }

        try {
          for (const varbind of response) {
            if (snmp.isVarbindError(varbind)) {
              throw new Error(snmp.varbindError(varbind));
            }
          }
          resolve();
        } catch (err) {
          reject(new Error(`SNMP SET failed for ${this.host}: ${err.message || err}`));
        }
      });
    });
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.readSession.close();
    this.writeSession.close();
  }
}

module.exports = {
  LindyClassic8Client,
};
