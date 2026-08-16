# AI client MCP examples

After `npm ci && npm run build`, put `node_modules/.bin` on `PATH` or use the
absolute path to a bin from this repository. Copy
[mcp.json.example](mcp.json.example) into Claude Desktop, Cursor, or another
stdio MCP host. Inject tokens from a secret store. Keep writes off until you
validate one exact object.

| Existing system | Guide | Command |
| --- | --- | --- |
| NetBox | [connect-existing-netbox.md](../../docs/connect-existing-netbox.md) | `enterprise-mcp-netbox` |
| Grafana | [connect-existing-grafana.md](../../docs/connect-existing-grafana.md) | `enterprise-mcp-grafana` |
| Zabbix | [connect-existing-zabbix.md](../../docs/connect-existing-zabbix.md) | `enterprise-mcp-zabbix` |
| WireGuard | [connect-existing-wireguard.md](../../docs/connect-existing-wireguard.md) | `enterprise-mcp-wireguard` |
| Kubernetes + Ansible | [connect-existing-kubernetes-ansible.md](../../docs/connect-existing-kubernetes-ansible.md) | `enterprise-mcp-kubernetes` |
| OPNsense | [connect-existing-opnsense.md](../../docs/connect-existing-opnsense.md) | `enterprise-mcp-opnsense` |

If a client cannot resolve the bin name, set `command` to `node` and `args` to
the matching `dist/src/*-server.js` file.
