# homebridge-lindy-classic8

Homebridge plugin for the **Lindy IPower Switch Classic 8 (Lindy 32657)**.

## What it does

- Reads the eight outlet names from the Classic8 automatically.
- Exposes a momentary **Power Cycle <outlet name>** switch for each selected outlet.
- Uses the Classic8's own native `OFF/ON` web command, so a reboot can finish even if the selected outlet powers Homebridge, the network switch, Wi-Fi or the router/firewall.
- Defaults individual cycles to a **1 second** OFF/ON delay.
- Optionally exposes ordinary persistent on/off switches.
- Adds **Power Cycle Everything**.
- Preserves the PDU's normal ON/OFF delay table and restores it after temporary cycle-specific changes.
- Persists a recovery journal under the Homebridge storage directory so delay restoration survives Homebridge itself being power-cycled.
- Uses the action name (for example **Power Cycle Hue Bridge**) as the HomeKit accessory display name so Apple Home proposes the correct name during pairing.

## Power Cycle Everything

With the default `allCycleStepSeconds: 1`, the plugin temporarily configures:

- OFF delays: `1,2,3,4,5,6,7,8`
- ON delays: `8,8,8,8,8,8,8,8`

It then asks the Classic8 to perform one native OFF/ON operation across all eight outlets. The resulting sequence is:

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

The PDU itself owns this sequence after the initial command, so Homebridge does not need to remain powered or connected while it runs.

## Validated Lindy 32657 behaviour

The following Classic8 behaviour was validated directly against a Lindy 32657:

- SNMPv1 state read/write at `1.3.6.1.4.1.17420.1.2.9.1.13.0`.
- Outlet names at `...14.1.0` through `...14.8.0`.
- ON delay table at `...21.0` and OFF delay table at `...22.0`.
- Native reboot request: `GET /offon.cgi?led=<24-bit selection>` using the PDU web login.
- Single-outlet 1 second cycle by temporarily setting that outlet's ON/OFF delays to 1.
- Multi-outlet timing behaves independently, which allows the sequential all-outlet profile above.

## Configuration

Example:

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

`webPassword` is required for the native OFF/ON function. It is the same password used to log in to the Classic8 web interface. Do not send the password to anyone unnecessarily; enter it directly in your Homebridge configuration/UI.

### Individual cycle overrides

```json
"outlets": [
  { "number": 1 },
  { "number": 3, "cycleDelaySeconds": 2 },
  { "number": 7, "name": "Hue Bridge" }
]
```

All eight outlets are exposed by default. Entries in `outlets` are per-outlet overrides: use them to rename an outlet in HomeKit, change its individual cycle delay, or set `"enabled": false` to hide that individual outlet. **Power Cycle Everything still controls all eight physical outlets.**

## Siri / Shortcuts

HomeKit does not have a native `power cycle` verb. The cleanest Siri phrasing is to create Apple Shortcuts that turn the corresponding momentary switch on.

Examples of shortcut names:

- `Power Cycle Myst`
- `Power Cycle WiFi`
- `Power Cycle the Rack Fans`
- `Power Cycle the NAS`
- `Power Cycle the Switch`
- `Power Cycle Pi-hole`
- `Power Cycle the Hue Bridge`
- `Power Cycle pfSense`
- `Power Cycle Everything`

That lets Siri accept natural phrases such as **"Power cycle the rack fans"** or **"Power cycle everything"**.

## Recovery behaviour

Before changing the Classic8 delay table for a native cycle, the plugin writes the existing values to a small recovery journal in Homebridge's persistent storage. After the operation it restores and verifies the original table.

If Homebridge or the network disappears before restoration can occur, the journal remains. On the next plugin start, or on a retry after connectivity returns, the original delay table is restored automatically.

## SNMP details

- outlet states: `1.3.6.1.4.1.17420.1.2.9.1.13.0`
- outlet names: `1.3.6.1.4.1.17420.1.2.9.1.14.<1-8>.0`
- ON delays: `1.3.6.1.4.1.17420.1.2.9.1.21.0`
- OFF delays: `1.3.6.1.4.1.17420.1.2.9.1.22.0`

The normal persistent on/off controls use a serialised read-modify-write operation so one outlet command does not overwrite the state of another outlet.

## Security

The Classic8 uses SNMPv1 and HTTP Basic authentication over HTTP. Those credentials are not encrypted on the wire. Keep the PDU management interface on a trusted LAN/VLAN and do not expose SNMP or its web UI to the public internet.

## Safety

A power cycle is a hard power interruption. Do not use it on equipment that may corrupt data or be damaged by sudden power loss unless that is an acceptable recovery action.

## Maintainer

Maintained by **ikthezeus**.

## Publishing / Homebridge verification

The package is intended to be published to npm as `homebridge-lindy-classic8`. The Homebridge verification process currently requires the source repository to be publicly available on **GitHub** with issues enabled, even if development also happens elsewhere. A GitLab repository can therefore remain the primary development remote, but a public GitHub mirror/repository is needed for a Homebridge verification request.
