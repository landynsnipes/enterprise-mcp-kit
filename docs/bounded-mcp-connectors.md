# Bounded MCP connectors

Keep the enterprise system you already operate. Each connector is a stdio MCP
process you point at that system. None of them install the vendor product.

Reads are exact-object only. Writes are off by default and require
`*_ENABLE_WRITES=true`, an expected prior state where applicable, and the
operator’s least-privilege token.

| Connector | Read tools | Optional write | Connect-existing guide |
| --- | --- | --- | --- |
| NetBox | `get_device_context`, `get_site_overview`, `get_connectivity_path`, `get_rack_context`, `get_power_path` | Governed writes on the HTTP gateway | [connect-existing-netbox.md](connect-existing-netbox.md) |
| Grafana | `get_dashboard_context`, `get_alert_rule_context` | `set_alert_rule_paused` | [connect-existing-grafana.md](connect-existing-grafana.md) |
| Zabbix | `get_host_context`, `get_problem_context` | `acknowledge_problem` | [connect-existing-zabbix.md](connect-existing-zabbix.md) |
| WireGuard | `get_interface_status`, optional `get_tunnel_health` | `restart_interface` | [connect-existing-wireguard.md](connect-existing-wireguard.md) |
| Kubernetes + Ansible | `get_workload_context` | `set_workload_replicas`, `run_admitted_playbook` | [connect-existing-kubernetes-ansible.md](connect-existing-kubernetes-ansible.md) |
| OPNsense | `get_interface_context`, `get_alias_context` | `toggle_alias` | [connect-existing-opnsense.md](connect-existing-opnsense.md) |

Client snippet for all six processes: [examples/mcp/mcp.json.example](../examples/mcp/mcp.json.example).

```sh
enterprise-mcp-netbox
enterprise-mcp-grafana
enterprise-mcp-zabbix
enterprise-mcp-wireguard
enterprise-mcp-kubernetes
enterprise-mcp-opnsense
```

Kubernetes namespaces can be allowlisted with `KUBERNETES_ADMITTED_NAMESPACES`.
Ansible runs only playbook IDs listed in `ANSIBLE_PLAYBOOKS`. WireGuard
interfaces can be allowlisted with `WIREGUARD_ADMITTED_INTERFACES`. Generic
kubectl, ansible-playbook, JSON-RPC, dashboard search, and firewall shells stay closed.
