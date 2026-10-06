'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const snmp = require('net-snmp');
const {
  OUTLET_COUNT,
  OIDS,
  bufferToString,
  parseStates,
  parseDelayList,
  stateToBoolean,
  parseOutletName,
  buildReadModifyWritePayload,
  buildNativeCycleMask,
  buildIndividualDelayProfile,
  buildSequentialAllDelayProfile,
  delayProfileToStrings,
  validateDelayProfile,
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
    this.webPort = options.webPort ?? 80;
    this.webUsername = options.webUsername || 'snmp';
    this.webPassword = options.webPassword || '';
    this.httpTimeout = options.httpTimeout ?? 5000;
    this.stateFile = options.stateFile;
    this.log = log;
    this.closed = false;
    this.writeQueue = Promise.resolve();
    this.restoreTimer = undefined;

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

  async getDelayProfile() {
    const values = await this.get([OIDS.onDelays, OIDS.offDelays]);
    return {
      on: parseDelayList(values[0]),
      off: parseDelayList(values[1]),
    };
  }

  async setOutlet(outletNumber, on) {
    validateOutletNumber(outletNumber);
    return this.enqueueWrite(() => this.setOutletLocked(outletNumber, Boolean(on)));
  }

  async cycleOutlet(outletNumber, delaySeconds = 1) {
    validateOutletNumber(outletNumber);
    const delay = clampInteger(delaySeconds, 1, 255, 1);

    return this.enqueueWrite(async () => {
      await this.restorePendingDelaysLocked();
      const original = await this.getDelayProfile();
      const temporary = buildIndividualDelayProfile(original, outletNumber, delay);
      const restoreAfterMs = ((delay * 2) + 2) * 1000;

      this.log?.info?.(`Native power cycle requested for outlet ${outletNumber}: ${delay}s OFF/ON delay.`);
      await this.prepareNativeCycle(original, temporary, {
        kind: 'outlet',
        outlets: [outletNumber],
      });

      try {
        await this.nativeOffOn([outletNumber]);
      } catch (error) {
        this.scheduleRestore(Math.max(restoreAfterMs, 5000));
        throw error;
      }

      this.scheduleRestore(restoreAfterMs);
      return true;
    });
  }

  async cycleAllSequential(stepSeconds = 1) {
    const step = clampInteger(stepSeconds, 1, 31, 1);

    return this.enqueueWrite(async () => {
      await this.restorePendingDelaysLocked();
      const original = await this.getDelayProfile();
      const temporary = buildSequentialAllDelayProfile(step);
      // Last outlet turns back on at 16 * step seconds. Give the PDU two
      // additional seconds before attempting to restore its normal delays.
      const restoreAfterMs = ((OUTLET_COUNT * 2 * step) + 2) * 1000;

      this.log?.warn?.(
        `Native Power Cycle Everything requested: outlets 1-${OUTLET_COUNT} OFF sequentially every ${step}s, then ON in the same order.`,
      );

      await this.prepareNativeCycle(original, temporary, {
        kind: 'all',
        outlets: Array.from({ length: OUTLET_COUNT }, (_, index) => index + 1),
      });

      try {
        await this.nativeOffOn(Array.from({ length: OUTLET_COUNT }, (_, index) => index + 1));
      } catch (error) {
        this.scheduleRestore(Math.max(restoreAfterMs, 10000));
        throw error;
      }

      this.scheduleRestore(restoreAfterMs);
      return true;
    });
  }

  async prepareNativeCycle(original, temporary, context) {
    this.requireWebCredentials();
    this.writePendingRestore(original, context);
    try {
      await this.setDelayProfileLocked(temporary);
    } catch (error) {
      // If changing the temporary profile failed, attempt to put the original
      // values back now. The journal is kept if that recovery also fails.
      try {
        await this.restorePendingDelaysLocked();
      } catch (restoreError) {
        this.log?.warn?.(`Could not restore Classic8 delays after setup failure: ${restoreError.message || restoreError}`);
      }
      throw error;
    }
  }

  async recoverPendingDelays() {
    return this.enqueueWrite(() => this.restorePendingDelaysLocked());
  }

  async restorePendingDelaysLocked() {
    const pending = this.readPendingRestore();
    if (!pending) {
      return false;
    }

    validateDelayProfile(pending.original);
    await this.setDelayProfileLocked(pending.original);
    const observed = await this.getDelayProfile();

    if (!sameArray(observed.on, pending.original.on) || !sameArray(observed.off, pending.original.off)) {
      throw new Error('Classic8 delay-profile restoration could not be verified.');
    }

    this.clearPendingRestore();
    this.log?.info?.('Restored the Classic8 ON/OFF delay profile after a native power cycle.');
    return true;
  }

  async setDelayProfileLocked(profile) {
    const strings = delayProfileToStrings(profile);
    await this.setOctetStrings([
      { oid: OIDS.onDelays, value: strings.on },
      { oid: OIDS.offDelays, value: strings.off },
    ]);
  }

  scheduleRestore(delayMs) {
    if (!this.stateFile || this.closed) {
      return;
    }

    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
    }

    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = undefined;
      void this.recoverPendingDelays().catch((error) => {
        if (this.closed) {
          return;
        }
        this.log?.warn?.(`Classic8 delay-profile restoration is pending: ${error.message || error}`);
        this.scheduleRestore(10000);
      });
    }, delayMs);
    this.restoreTimer.unref?.();
  }

  writePendingRestore(original, context) {
    if (!this.stateFile) {
      throw new Error('No persistent recovery-state path was supplied; refusing a native cycle that changes PDU delays.');
    }

    validateDelayProfile(original);
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const temporaryFile = `${this.stateFile}.tmp`;
    const payload = {
      version: 1,
      host: this.host,
      createdAt: new Date().toISOString(),
      context,
      original,
    };
    fs.writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryFile, this.stateFile);
  }

  readPendingRestore() {
    if (!this.stateFile || !fs.existsSync(this.stateFile)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      if (parsed.host && parsed.host !== this.host) {
        throw new Error(`Recovery journal is for ${parsed.host}, not ${this.host}.`);
      }
      return parsed;
    } catch (error) {
      throw new Error(`Could not read Classic8 recovery journal ${this.stateFile}: ${error.message || error}`);
    }
  }

  clearPendingRestore() {
    if (this.stateFile && fs.existsSync(this.stateFile)) {
      fs.unlinkSync(this.stateFile);
    }
  }

  requireWebCredentials() {
    if (!this.webPassword) {
      throw new Error(
        'Classic8 webPassword is not configured. Native OFF/ON requires the PDU web credentials.',
      );
    }
  }

  nativeOffOn(outletNumbers) {
    this.requireWebCredentials();
    const mask = buildNativeCycleMask(outletNumbers);
    const requestPath = `/offon.cgi?led=${mask}`;

    return new Promise((resolve, reject) => {
      const request = http.get({
        hostname: this.host,
        port: this.webPort,
        path: requestPath,
        auth: `${this.webUsername}:${this.webPassword}`,
        timeout: this.httpTimeout,
        headers: {
          Connection: 'close',
          'User-Agent': 'homebridge-lindy-classic8',
        },
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 4096) {
            body = body.slice(0, 4096);
          }
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Classic8 OFF/ON HTTP request failed with status ${response.statusCode}.`));
            return;
          }
          if (body && !/success/i.test(body)) {
            this.log?.debug?.(`Classic8 OFF/ON response: ${body.trim()}`);
          }
          resolve(body.trim());
        });
      });

      request.setTimeout(this.httpTimeout, () => {
        request.destroy(new Error(`Classic8 OFF/ON HTTP request timed out after ${this.httpTimeout}ms.`));
      });
      request.on('error', (error) => {
        reject(new Error(`Classic8 OFF/ON HTTP request failed: ${error.message || error}`));
      });
    });
  }

  enqueueWrite(operation) {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  async setOutletLocked(outletNumber, on) {
    const states = await this.getOutletStates();
    const payload = buildReadModifyWritePayload(states, outletNumber, on);
    await this.setOctetString(OIDS.states, payload);
    await sleep(this.verifyDelay);

    const observed = await this.getOutletState(outletNumber);
    if (observed !== on) {
      const desired = on ? 'ON' : 'OFF';
      const actual = observed === null ? 'unavailable/fault' : (observed ? 'ON' : 'OFF');
      throw new Error(`Classic8 outlet ${outletNumber} failed to reach ${desired}; reported state is ${actual}.`);
    }

    return observed;
  }

  /**
   * The Classic8's older SNMPv1 firmware does not reliably handle requests
   * containing multiple varbinds. In hardware testing an eight-OID GET timed
   * out and the PDU emitted a malformed response that could make net-snmp's
   * ASN.1 decoder throw outside the request callback.
   *
   * Keep every SNMP packet to exactly one varbind. Apart from being kinder to
   * the PDU, this keeps parser failures on the firmware's known-good path.
   */
  async get(oids) {
    const values = [];
    for (const oid of oids) {
      values.push(await this.getOne(oid));
    }
    return values;
  }

  getOne(oid) {
    if (this.closed) {
      return Promise.reject(new Error('SNMP client is closed.'));
    }

    return new Promise((resolve, reject) => {
      this.readSession.get([oid], (error, varbinds) => {
        if (error) {
          reject(new Error(`SNMP GET failed for ${this.host} (${oid}): ${error.message || error}`));
          return;
        }

        try {
          if (!Array.isArray(varbinds) || varbinds.length !== 1) {
            throw new Error(`expected one varbind, received ${Array.isArray(varbinds) ? varbinds.length : 'none'}`);
          }
          const [varbind] = varbinds;
          if (snmp.isVarbindError(varbind)) {
            throw new Error(snmp.varbindError(varbind));
          }
          resolve(varbind.value);
        } catch (err) {
          reject(new Error(`SNMP GET failed for ${this.host} (${oid}): ${err.message || err}`));
        }
      });
    });
  }

  setOctetString(oid, value) {
    return this.setOneOctetString(oid, value);
  }

  async setOctetStrings(entries) {
    // As with GET, use one varbind per packet for Classic8 firmware
    // compatibility. Delay-profile changes are journalled before they are
    // written, so a partial update can still be restored safely.
    for (const { oid, value } of entries) {
      await this.setOneOctetString(oid, value);
    }
  }

  setOneOctetString(oid, value) {
    if (this.closed) {
      return Promise.reject(new Error('SNMP client is closed.'));
    }

    const varbind = {
      oid,
      type: snmp.ObjectType.OctetString,
      value,
    };

    return new Promise((resolve, reject) => {
      this.writeSession.set([varbind], (error, response) => {
        if (error) {
          reject(new Error(`SNMP SET failed for ${this.host} (${oid}): ${error.message || error}`));
          return;
        }

        try {
          if (!Array.isArray(response) || response.length !== 1) {
            throw new Error(`expected one varbind, received ${Array.isArray(response) ? response.length : 'none'}`);
          }
          const [responseVarbind] = response;
          if (snmp.isVarbindError(responseVarbind)) {
            throw new Error(snmp.varbindError(responseVarbind));
          }
          resolve();
        } catch (err) {
          reject(new Error(`SNMP SET failed for ${this.host} (${oid}): ${err.message || err}`));
        }
      });
    });
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = undefined;
    }
    this.readSession.close();
    this.writeSession.close();
  }
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

module.exports = {
  LindyClassic8Client,
};
