# Enterprise MCP Kit

[![Validate](https://github.com/landynsnipes/enterprise-mcp-kit/actions/workflows/validate.yml/badge.svg)](https://github.com/landynsnipes/enterprise-mcp-kit/actions/workflows/validate.yml)

Bounded MCP jobs for systems you already run — and a governed AIOps lab that
proves the same controls under failure. Clone the repo, build once, and point
a client at one exact object in NetBox, Grafana, Zabbix, WireGuard,
Kubernetes, or OPNsense. Writes stay off until you enable them.

This is not a generic vendor API, shell, `kubectl`, playbook runner, or
autonomous remediation product.

## Five-minute start

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run build
```

| Existing system | Command | You supply | Guide |
| --- | --- | --- | --- |
| NetBox | `enterprise-mcp-netbox` | URL + API token | [Connect existing NetBox](docs/connect-existing-netbox.md) |
| Grafana | `enterprise-mcp-grafana` | URL + service account token | [Connect existing Grafana](docs/connect-existing-grafana.md) |
| Zabbix | `enterprise-mcp-zabbix` | URL + API token | [Connect existing Zabbix](docs/connect-existing-zabbix.md) |
| WireGuard | `enterprise-mcp-wireguard` | HTTP status API or local `wg` | [Connect existing WireGuard](docs/connect-existing-wireguard.md) |
| Kubernetes + Ansible | `enterprise-mcp-kubernetes` | API server + token; optional admitted playbooks | [Connect existing Kubernetes and Ansible](docs/connect-existing-kubernetes-ansible.md) |
| OPNsense | `enterprise-mcp-opnsense` | URL + API key/secret | [Connect existing OPNsense](docs/connect-existing-opnsense.md) |

Copy [examples/mcp/mcp.json.example](examples/mcp/mcp.json.example) into Claude
Desktop, Cursor, or another stdio MCP client. Ask a job such as “What does
Zabbix know about host `edge-01`?”

Full install, container, and live-check steps: [Use an MCP](docs/use-an-mcp.md).

## Choose a path

| Path | When to use | Start |
| --- | --- | --- |
| Use an MCP | You already operate one system above | [docs/use-an-mcp.md](docs/use-an-mcp.md) |
| Governed AIOps lab | You want the integration → observe → recommend → approve → verify loop | [docs/run-the-lab.md](docs/run-the-lab.md) |

## Governed AIOps lab

The supported product is the stdio MCP connectors. The lab is the public
proof that those connectors sit inside a real operational workflow:

```text
NetBox source of truth
  → Ansible / desired state
  → Kubernetes workloads
  → Zabbix + Prometheus
  → Grafana
  → bounded recommendation (LLM output is untrusted)
  → human approval
  → admitted execution only
  → telemetry verification or rollback
```

Measured lab evidence, with SHA-256 artifacts and remaining limitations, is
in the [acceptance evidence ledger](docs/acceptance-evidence.md). Architecture
decisions and failure assumptions are in the
[two-site architecture contract](docs/two-site-architecture-contract.md).

The current lab proves governed recommendations, logical two-site topology,
bounded execution, runtime verification, rollback, and isolated database
recovery. It does **not** prove independent-site high availability, physical
disaster recovery, production scale, or autonomous remediation. The
deterministic incident evaluator does not call a production LLM.

## Safety defaults

- Exact identifiers only. No host lists, dashboard search, or firewall shells.
- `*_ENABLE_WRITES` defaults to false. Mutations require an expected current value.
- Tokens and WireGuard private keys never appear in tool output.
- Compatibility and what tests actually prove: [docs/compatibility.md](docs/compatibility.md).
- Vulnerability reports: [SECURITY.md](SECURITY.md).

NetBox is live-verified against the included Community 4.6.5 lab. Grafana,
Zabbix, WireGuard, Kubernetes, and OPNsense ship with mocked contract tests
plus an operator `verify:connector` hook for *your* system.

## Status

Version **0.2.0**. Apache-2.0. The stdio MCP surfaces are the supported
product. The governed HTTP gateway, CloudEvents path, and two-site AIOps lab
remain evaluation or reference work. See
[CHANGELOG.md](CHANGELOG.md),
[Enterprise distribution architecture](ENTERPRISE-DISTRIBUTION.md),
and the [NetBox adapter contract](docs/netbox-adapter-contract.md).

## Local commands

```sh
npm run validate
npm run verify:connector
```

## License

Licensed under the [Apache License 2.0](LICENSE).
