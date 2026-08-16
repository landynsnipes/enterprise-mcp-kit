# Run the evaluation lab

Use this path only when you want the included NetBox and AIOps proofs. If you
already operate one of the supported systems, use [use-an-mcp.md](use-an-mcp.md)
instead.

## Start here

- [Run the complete evaluation lab](run-complete-demo.md)
- [Install the private Docker Compose production reference](install-production-compose.md)
- [Enterprise distribution architecture](../ENTERPRISE-DISTRIBUTION.md)
- [Open Enterprise AIOps Platform roadmap](open-enterprise-aiops-roadmap.md)
- [Acceptance evidence ledger](acceptance-evidence.md)
- [AT evidence case study](at-evidence-case-study.md)

Lab systemd units assume the repository is available at
`/opt/enterprise-mcp-kit`. Symlink or copy your clone there, or edit the unit
paths before enabling them.

The included NetBox environment is an evaluation and reference deployment, not
a turnkey production distribution. You remain responsible for identity, TLS,
backups, upgrades, availability, and organization-specific policy.
