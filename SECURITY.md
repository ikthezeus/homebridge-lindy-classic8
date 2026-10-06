# Security policy

## Supported versions

The latest published npm release and the current `main` branch are actively maintained.

Pre-public development versions `0.1.0` through `0.1.8` are retained for historical reference but are not independently supported releases.

## Reporting a vulnerability

Please report security-sensitive issues privately rather than posting credentials, network details, or exploitable information in a public issue.

The preferred method is GitHub private vulnerability reporting:

1. Open the repository's **Security** section on GitHub.
2. Choose **Report a vulnerability**.
3. Provide enough information to reproduce and assess the issue.

Repository:

https://github.com/ikthezeus/homebridge-lindy-classic8

If GitHub private vulnerability reporting is unavailable, a confidential issue may instead be opened in the upstream GitLab project.

Please remove or redact:

- Classic8 web passwords;
- SNMP community strings;
- private keys or access tokens;
- public IP addresses;
- unnecessary identifying network information.

## Device security considerations

The Lindy Classic8 uses SNMPv1 and HTTP Basic authentication over unencrypted HTTP.

This plugin cannot add transport encryption to the PDU firmware.

Keep the PDU management interface on a trusted LAN or VLAN and restrict management access using appropriate network controls.
