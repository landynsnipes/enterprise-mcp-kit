# Security policy

This repository connects AI clients to existing operational systems. Treat
tokens, API keys, WireGuard keys, and inventory identifiers as sensitive.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | Yes |
| 0.1.x | Security fixes only until 0.3.0 |
| unreleased `main` | Best effort; do not treat as a support window |

Compatibility with vendor APIs is listed in [docs/compatibility.md](docs/compatibility.md).
A passing unit test is not a production certification.

Governed AIOps threats, evidence links, and residual risk:
[docs/threat-model.md](docs/threat-model.md).

## Required controls

- Never commit tokens, keys, customer inventory, or production URLs.
- Keep write flags (`*_ENABLE_WRITES`) off until a named test object is validated.
- Use least-privilege credentials. Read tools must work with a read-only role.
- Do not expose generic vendor APIs, shells, `kubectl`, or arbitrary playbooks.
- Never return secrets, private keys, or raw error bodies from MCP tools.
- Record the repository release and target system version before production use.

## Reporting

Use GitHub private vulnerability reporting for this repository. If that is
unavailable, contact the repository owner through GitHub. Do not open a public
issue for an unpatched vulnerability or include live credentials, customer
data, or a working exploit in a report.
