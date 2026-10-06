# homebridge-lindy-classic8

Homebridge plugin for the **Lindy IPower Switch Classic 8 (Lindy 32657)**.

It talks directly to the Classic8 over **SNMPv1** and can:

- read the eight outlet names from the PDU automatically;
- expose a momentary **Restart / Power Cycle** switch for each selected outlet;
- optionally expose normal persistent on/off switches;
- read the actual outlet states from the PDU;
- use a configurable off-time for power cycles;
- override individual outlet names and cycle delays in Homebridge;
- recover if the PDU is offline when Homebridge starts.

## HomeKit behaviour

The safe default is **restart-only**.

If the Classic8 has an outlet named `Router`, HomeKit gets a switch called:

`Restart Router`

Turning that switch on performs:

1. Router outlet OFF
2. wait 5 seconds (configurable)
3. Router outlet ON
4. `Restart Router` returns to OFF automatically

This makes Siri usage straightforward, for example:

> Turn on Restart Router

Permanent outlet controls are disabled by default so a critical device is less likely to be accidentally left switched off. They can be enabled with `exposeOutletSwitches`.

## SNMP details

The Classic8 uses the DigiPower enterprise tree (`1.3.6.1.4.1.17420`). This plugin uses:

- outlet states: `1.3.6.1.4.1.17420.1.2.9.1.13.0`
- outlet names: `1.3.6.1.4.1.17420.1.2.9.1.14.<1-8>.0`

The plugin first uses a targeted SNMP payload where `5` means "leave this outlet unchanged". It verifies the resulting state and automatically falls back to a serialised read-modify-write operation for older firmware if required.

## Before installing

In the Classic8 web interface, check **Configuration -> SNMP** and note the read/write community names.

The web login (`snmp` / `1234` on factory defaults) is **not** the same thing as the SNMP community string.

SNMPv1 does not encrypt community names. Keep UDP port 161 on your trusted local network only.

## Quick read-only test

After installing dependencies, you can test discovery without switching anything:

```bash
node tools/snmp-read.js 192.168.1.50 public
```

Example output:

```text
Device: PDU (32657)
sysObjectID: 1.3.6.1.4.1.17420

1: Router - ON
2: ONT - ON
3: Switch - ON
...
```

## Homebridge configuration

### Simplest configuration

This exposes all eight outlets using the names stored in the Classic8 and creates restart switches only:

```json
{
  "platform": "LindyClassic8",
  "name": "Lindy Classic8",
  "host": "192.168.1.50",
  "readCommunity": "public",
  "writeCommunity": "private",
  "cycleDelaySeconds": 5
}
```

If your read and write community are the same, `writeCommunity` can be omitted.

### Only expose selected outlets

When an `outlets` list is supplied, only those outlets are exposed:

```json
{
  "platform": "LindyClassic8",
  "name": "Rack PDU",
  "host": "192.168.1.50",
  "readCommunity": "public",
  "writeCommunity": "private",
  "cycleDelaySeconds": 5,
  "outlets": [
    { "number": 1 },
    { "number": 2, "name": "Fibre ONT", "cycleDelaySeconds": 10 },
    { "number": 5, "name": "Network Switch" }
  ]
}
```

A blank `name` uses the name stored in the Classic8.

### Also allow permanent on/off

```json
{
  "exposeCycleSwitches": true,
  "exposeOutletSwitches": true
}
```

With this enabled, each HomeKit accessory has its normal outlet switch plus its `Restart <name>` switch.

## Installation from the supplied npm package

Install the `.tgz` locally on the Homebridge host/container:

```bash
npm install -g /path/to/homebridge-lindy-classic8-0.1.0.tgz
```

Then restart Homebridge and add **Lindy Classic8** in the Homebridge UI.

For a development install from the source folder:

```bash
cd homebridge-lindy-classic8
npm install
npm link
```

Restart Homebridge afterwards.

## Troubleshooting

### Reads work but restart fails

The SNMP read community may not have write permission. Set `writeCommunity` to the PDU's R/W community.

### Timeout / no response

Confirm Homebridge can reach the PDU on UDP/161 and that no firewall/VLAN rule is blocking SNMP.

### The wrong names appear

Either restart Homebridge after changing names in the Classic8, or set explicit `name` overrides in the `outlets` list.

### Safety

A power cycle is a real hard power interruption. Do not use it on devices that can be damaged or corrupt data when power is removed unexpectedly.
