# Changelog

## 0.1.7

- Use `Power Cycle <outlet name>` as the HomeKit accessory display name when cycle controls are enabled, including existing cached accessories.
- Add maintainer metadata for `ikthezeus`.
- Declare HAP support in package metadata.
- Correct the documented Classic8 SNMP OIDs.
- Correct the README description of per-outlet overrides.

## 0.1.6

- Remove unsupported `ConfiguredName` writes on Switch services to eliminate Homebridge 2.x warnings.

## 0.1.5

- Use one SNMP varbind per request for compatibility with older Classic8 firmware.

## 0.1.4

- Add a custom Homebridge settings UI with clearer sections and typed numeric controls.

## 0.1.3

- Use the PDU-native OFF/ON operation for resilient individual and all-outlet power cycling.
