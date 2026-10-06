# Security policy

## Supported versions

Until the first public npm release, only the latest commit on `main` is actively maintained.

## Reporting a vulnerability

Please report security-sensitive issues privately rather than posting credentials or exploitable details in a public issue.

Use a **confidential GitLab issue** in this project where available, or contact the maintainer through the repository owner's GitLab profile.

Include enough information to reproduce the issue, but remove:

- Classic8 web passwords;
- SNMP community strings;
- private keys or tokens;
- public IP addresses or other unnecessary identifying network information.

## Device security considerations

The Lindy Classic8 uses SNMPv1 and HTTP Basic authentication over unencrypted HTTP. This plugin cannot add transport encryption to the PDU firmware. Keep the management interfaces on a trusted network and restrict access with network controls.
