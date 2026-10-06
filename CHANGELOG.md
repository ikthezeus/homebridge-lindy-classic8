# Changelog

All notable changes to this project are documented here.

> The public Git repository was initialised after 0.1.8. Versions 0.1.0 through 0.1.8 are reconstructed from their development source snapshots; local network example values were sanitised for public publication.

## [Unreleased]

## [0.1.9] - 2026-10-06

- Catch unexpected asynchronous startup failures and log them instead of allowing an unhandled promise rejection.
- Correct the settings description for per-outlet overrides so it matches the plugin's actual behaviour.
- Add regression coverage for unconfigured and failed startup paths.
- Enable GitHub private vulnerability reporting and update the security policy.

- Add the public GitHub mirror and GitHub Issues/Release metadata required for the Homebridge ecosystem.
- Add GitHub Actions validation on Node.js 22, 24 and 26.

- Align the CI matrix with the current Homebridge-supported Node.js LTS releases: Node.js 22, 24 and 26.
- Explicitly declare compatibility with Homebridge 1.8+ and Homebridge 2.x.
- Raise the minimum supported Node.js version to Node.js 22.12.0.

## [0.1.8] - 2026-10-06

- Set the HomeKit Accessory Information `Name` characteristic to the power-cycle action name so Apple Home proposes names such as `Power Cycle Hue Bridge` during child-bridge pairing.
- Keep the Accessory Information name synchronised when outlet names or overrides change.
- Apply the same explicit Accessory Information naming to `Power Cycle Everything`.
- Add specific tests for HomeKit accessory naming behaviour.

## [0.1.7] - 2026-10-06

- Use `Power Cycle <outlet name>` as the HomeKit accessory display name, including existing cached accessories.
- Add shared naming helpers and naming regression tests.
- Add maintainer metadata for `ikthezeus`.
- Declare HAP support using the current `supports-hap` package keyword.
- Correct documented Classic8 SNMP OIDs and per-outlet override documentation.

## [0.1.6] - 2026-10-06

- Remove unsupported `ConfiguredName` writes on Switch services to eliminate Homebridge 2.x warnings.

## [0.1.5] - 2026-10-06

- Send exactly one SNMP OID/varbind per request for compatibility with older Classic8 firmware.
- Avoid the malformed/missing responses observed when the validated 32657 receives multi-varbind SNMPv1 requests.

## [0.1.4] - 2026-10-06

- Add a custom Homebridge settings UI.
- Group connection, power-cycle, outlet override, and advanced settings more clearly.
- Provide both sliders and typed numeric inputs for numeric settings.
- Present all eight outlet overrides as explicit individual rows.
- Mark the platform as singular so the Homebridge UI does not offer an unnecessary additional platform instance.

## [0.1.3] - 2026-10-06

- Switch power cycling to the Classic8's native HTTP `OFF/ON` operation.
- Add 1-second individual power-cycle support using temporary per-outlet delay changes.
- Add autonomous `Power Cycle Everything` sequencing that continues even when Homebridge or the network path is power-cycled.
- Add delay-table preservation, verification, and persistent recovery journalling.
- Expand protocol tests for native reboot masks and all-outlet timing.

## [0.1.2] - 2026-10-06

- Rename momentary controls from `Restart <name>` to `Power Cycle <name>`.
- Update Homebridge configuration labels and logging to use consistent power-cycle terminology.

## [0.1.1] - 2026-10-06

- Use serialised shared-state read/modify/write operations for individual outlet state changes.
- Verify outlet state after writes.
- Return momentary HomeKit cycle requests immediately so long cycle delays do not appear as HAP timeouts.
- Catch and log cycle failures while resetting the momentary switch reliably.
- Default the Classic8 SNMP write community to `public`, matching the validated unit's configuration.

## [0.1.0] - 2026-10-06

- Initial Homebridge platform for the Lindy IPower Switch Classic 8 (32657).
- Discover outlet names from the PDU over SNMPv1.
- Read and control the shared eight-outlet state.
- Expose momentary restart controls and optional persistent on/off controls.
- Add configuration schema, read-only SNMP diagnostic tool, protocol tests, README and MIT licence.
