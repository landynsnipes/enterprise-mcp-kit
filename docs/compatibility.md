# Compatibility and evidence

Record the repository release and the vendor version before production use.
This matrix is the support window, not a certification.

| Connector | Declared target | Automated evidence today | Operator verify |
| --- | --- | --- | --- |
| NetBox | Community 4.6.x v2 API | Mocked unit tests plus live lab (`npm run demo:verify`) against the included 4.6.5 compose | [connect-existing-netbox.md](connect-existing-netbox.md) |
| Grafana | HTTP API on Grafana 10.4 and 11.x | Mocked unit tests in `test/platform-mcp.test.ts` | [connect-existing-grafana.md](connect-existing-grafana.md) and `CONNECTOR=grafana npm run verify:connector` |
| Zabbix | JSON-RPC on Zabbix 6.4 and 7.x | Mocked unit tests | [connect-existing-zabbix.md](connect-existing-zabbix.md) and `CONNECTOR=zabbix npm run verify:connector` |
| WireGuard | HTTP status API, or local `wg`/`systemctl` on Linux | Mocked unit tests; optional netns lab | [connect-existing-wireguard.md](connect-existing-wireguard.md) |
| Kubernetes | `apps/v1` Deployment get/patch on 1.29–1.32 | Mocked unit tests | [connect-existing-kubernetes-ansible.md](connect-existing-kubernetes-ansible.md) |
| Ansible | `ansible-playbook` with an operator-admitted ID-to-path map | Mocked rejection of unknown IDs | Same guide; empty `ANSIBLE_PLAYBOOKS` rejects every ID |
| OPNsense | Core API key/secret on 24.7 and 25.x | Mocked unit tests | [connect-existing-opnsense.md](connect-existing-opnsense.md) |

NetBox is the only connector with a repository-owned live lab in CI-adjacent
scripts. The other connectors are ready to attach to *your* system. They are
not claimed live-verified against a vendor cloud or a public sandbox.

## What a pass means

- Unit tests prove schema, exact-object bounds, and write-gate behavior.
- `npm run verify:connector` proves one read against credentials you supply.
- Lab scripts prove the sanitized evaluation inventory only.

None of those replace your change-control, SSO, or production acceptance test.
