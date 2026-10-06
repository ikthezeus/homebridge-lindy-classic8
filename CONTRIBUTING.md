# Contributing

Thanks for helping improve `homebridge-lindy-classic8`.

## Before opening a change

For bugs or hardware compatibility reports, please include:

- Lindy/DigiPower model number;
- firmware version if known;
- Homebridge version;
- Node.js version;
- relevant plugin logs with passwords and SNMP community strings removed;
- whether SNMP reads, SNMP writes, and the Classic8 web UI are reachable from the Homebridge host.

Do **not** post PDU web passwords, SNMP community strings, public IP addresses, or other credentials.

## Development setup

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

All four commands should complete successfully before submitting a merge request.

## Scope

The only hardware currently claimed as validated is the Lindy IPower Switch Classic 8 model 32657. Support for other devices should be backed by repeatable testing rather than assumed from similar OIDs or web interfaces.

## Merge requests

- Keep changes focused.
- Add or update tests for behavioural changes.
- Update `README.md` when configuration or user-facing behaviour changes.
- Update `CHANGELOG.md` for changes intended for the next release.
- Do not commit generated `.tgz` packages, ZIP archives, `node_modules`, credentials, or local Homebridge configuration.
