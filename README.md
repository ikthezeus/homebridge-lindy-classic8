# homebridge-lindy-classic8

Homebridge plugin for the **Lindy IPower Switch Classic 8 (Lindy 32657)**.

It exposes safe, momentary HomeKit power-cycle controls for each of the PDU's eight outlets and can also perform an autonomous, staggered **Power Cycle Everything** sequence.

> **Release status:** the plugin is hardware-validated on a Lindy 32657. Version `0.1.9` is the first version prepared for public npm distribution. Versions `0.1.0` through `0.1.8` were pre-public development builds; their source snapshots are preserved in the Git history and tags, with local network example values sanitised for public publication.

## Features

- Reads all eight outlet names directly from the Classic8.
- Creates momentary HomeKit switches named **Power Cycle `<outlet name>`**.
- Uses the Classic8's own native `OFF/ON` operation, so a cycle can finish even if the selected outlet powers Homebridge or part of the network path.
- Defaults individual cycles to a **1 second** OFF/ON delay.
- Adds a separate **Power Cycle Everything** control.
- Performs whole-PDU cycling autonomously on the PDU with configurable stagger timing.
- Preserves the PDU's normal ON/OFF delay tables and restores them after temporary cycle-specific changes.
- Stores a recovery journal in Homebridge's persistent storage so delay restoration survives Homebridge itself being power-cycled.
- Optionally exposes persistent on/off controls, disabled by default for safety.
- Includes a custom Homebridge settings UI with typed numeric fields and per-outlet overrides.
- Uses single-varbind SNMP requests for compatibility with older Classic8 firmware.

## Hardware support

Validated directly on:

- **Lindy IPower Switch Classic 8**
- **Lindy model 32657**
- SNMPv1 management
- Classic8 HTTP Basic-authenticated web interface

Other DigiPower-derived PDUs may expose similar OIDs and web endpoints, but they are **not currently claimed as supported** unless independently validated.

## How power cycling works

### Individual outlet

For an individual outlet, the plugin:

1. reads and journals the PDU's current delay tables;
2. temporarily sets that outlet's ON and OFF delays to the configured cycle delay (default: 1 second);
3. asks the PDU to perform its native `OFF/ON` operation;
4. restores and verifies the original delay tables.

Because the PDU owns the actual OFF/ON operation after the request is accepted, the cycle can finish even if Homebridge itself loses power or network connectivity during the reboot.

### Power Cycle Everything

With the default 1-second step, the plugin temporarily configures:

```text
OFF delays: 1,2,3,4,5,6,7,8
ON delays:  8,8,8,8,8,8,8,8
```

The PDU then performs one native OFF/ON operation across all eight outlets, resulting approximately in:

```text
~1s   Outlet 1 OFF
~2s   Outlet 2 OFF
~3s   Outlet 3 OFF
...
~8s   Outlet 8 OFF
~9s   Outlet 1 ON
~10s  Outlet 2 ON
...
~16s  Outlet 8 ON
```

The sequence continues on the PDU even if Homebridge, Wi-Fi, a network switch, or a router/firewall is among the outlets being cycled.

## Installation

### Homebridge UI / npm

Once the package is published to npm, install **homebridge-lindy-classic8** through the Homebridge UI or with npm:

```bash
npm install -g homebridge-lindy-classic8
```

Until the npm release is available, clone the repository for development/testing:

```bash
git clone https://github.com/ikthezeus/homebridge-lindy-classic8.git
cd homebridge-lindy-classic8
npm install
npm test
npm run check
```

## Configuration

The custom Homebridge settings UI is recommended.

A minimal JSON configuration looks like:

```json
{
  "platform": "LindyClassic8",
  "name": "Lindy Classic8",
  "host": "192.168.1.50",
  "readCommunity": "public",
  "writeCommunity": "public",
  "webUsername": "snmp",
  "webPassword": "YOUR_CLASSIC8_WEB_PASSWORD",
  "cycleDelaySeconds": 1,
  "exposeCycleSwitches": true,
  "exposeAllCycleSwitch": true,
  "allCycleName": "Power Cycle Everything",
  "allCycleStepSeconds": 1,
  "exposeOutletSwitches": false
}
```

The `webPassword` is the password used to log in to the Classic8 web interface. It is required for the native `OFF/ON` command.

### Per-outlet overrides

All eight outlets are exposed by default and use the names stored in the Classic8. Overrides can rename an outlet in HomeKit, change its individual cycle delay, or hide the individual control:

```json
"outlets": [
  { "number": 3, "cycleDelaySeconds": 2 },
  { "number": 7, "name": "Hue Bridge" },
  { "number": 8, "enabled": false }
]
```

`Power Cycle Everything` still controls all eight physical outlets, including an outlet whose individual HomeKit control is hidden.

## HomeKit and Siri

The plugin intentionally exposes power-cycle actions as **momentary switches**. HomeKit does not provide a native `power cycle` verb.

For natural Siri commands, create an Apple Shortcut that turns the appropriate momentary switch on. For example:

- HomeKit switch: **Power Cycle Rack Fans**
- Shortcut name: **Power Cycle the Rack Fans**

You can then say:

> "Siri, power cycle the rack fans."

## Validated Classic8 interfaces

The following behaviour was validated directly against a Lindy 32657:

| Purpose | Interface |
| --- | --- |
| Outlet state | `1.3.6.1.4.1.17420.1.2.9.1.13.0` |
| Outlet names | `1.3.6.1.4.1.17420.1.2.9.1.14.<1-8>.0` |
| ON delay table | `1.3.6.1.4.1.17420.1.2.9.1.21.0` |
| OFF delay table | `1.3.6.1.4.1.17420.1.2.9.1.22.0` |
| Native reboot | `GET /offon.cgi?led=<24-bit selection>` |

The Classic8 firmware tested here does not reliably accept multi-varbind SNMP requests, so the plugin deliberately sends one OID/varbind per SNMP operation.

## Recovery behaviour

Before changing delay tables, the plugin records the original values in a recovery journal under the Homebridge storage directory.

If Homebridge or the network disappears before restoration completes, the journal remains. On a later startup, or when connectivity returns, the plugin retries restoration and verifies the original values.

## Security

The Classic8 uses **SNMPv1** and **HTTP Basic authentication over HTTP**. Community strings and web credentials are therefore not encrypted on the wire.

- Keep the PDU management interface on a trusted LAN/VLAN.
- Do not expose SNMP (UDP/161) or the Classic8 web UI directly to the public internet.
- Use network controls to limit management access where possible.

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## Safety

A power cycle is a hard power interruption. Do not use it on equipment that may corrupt data or be damaged by sudden power loss unless that is an acceptable recovery action.

## Development

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).


## Repository

The project is developed in GitLab and mirrored publicly to GitHub for the Homebridge ecosystem.

- Public source, issues and releases: https://github.com/ikthezeus/homebridge-lindy-classic8
- Development upstream: https://gitlab.com/homebridge4/homebridge-lindy-classic8

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT. See [LICENSE](LICENSE).

## Maintainer

Maintained by **ikthezeus**.
