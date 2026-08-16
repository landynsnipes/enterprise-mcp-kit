# Use an MCP with a system you already run

This is the product path. It does not install NetBox, Grafana, Zabbix,
WireGuard, Kubernetes, or OPNsense.

## Five minutes

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run build
```

Point an MCP client at one command and the credentials you already use:

| Existing system | Command after build | Guide |
| --- | --- | --- |
| NetBox | `enterprise-mcp-netbox` | [connect-existing-netbox.md](connect-existing-netbox.md) |
| Grafana | `enterprise-mcp-grafana` | [connect-existing-grafana.md](connect-existing-grafana.md) |
| Zabbix | `enterprise-mcp-zabbix` | [connect-existing-zabbix.md](connect-existing-zabbix.md) |
| WireGuard | `enterprise-mcp-wireguard` | [connect-existing-wireguard.md](connect-existing-wireguard.md) |
| Kubernetes + Ansible | `enterprise-mcp-kubernetes` | [connect-existing-kubernetes-ansible.md](connect-existing-kubernetes-ansible.md) |
| OPNsense | `enterprise-mcp-opnsense` | [connect-existing-opnsense.md](connect-existing-opnsense.md) |

Copy [examples/mcp/mcp.json.example](../examples/mcp/mcp.json.example). Leave
`*_ENABLE_WRITES` false until you have validated one exact read.

Ask the client a job, not an API question:

- “What does Zabbix know about host `edge-01`?”
- “What does Grafana know about dashboard UID `abc`?”
- “What does NetBox know about device `edge-phx-01`?”

## Container

```sh
docker build -f Dockerfile.mcp --build-arg MCP_CONNECTOR=zabbix -t enterprise-mcp-zabbix .
docker run --rm -i \
  -e ZABBIX_BASE_URL \
  -e ZABBIX_TOKEN \
  enterprise-mcp-zabbix
```

## Live check

When you have credentials for a non-production object:

```sh
export CONNECTOR=zabbix
export ZABBIX_BASE_URL="https://zabbix.example.com"
export ZABBIX_TOKEN="<token>"
export ZABBIX_VERIFY_HOST="edge-01"
npm run verify:connector
```

Without those variables the script prints the required env and exits 2. It
does not invent a pass.

## Lab path

If you do not already have NetBox and want the evaluation environment, use
[run-the-lab.md](run-the-lab.md).
