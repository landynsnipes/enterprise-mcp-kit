# Native WSL two-site WireGuard lab

This is the preferred local Phase 1 proof. It uses Linux network namespaces,
veth links, a CHI bridge, WireGuard, and nftables directly inside Ubuntu WSL.
It does not require Docker networking, Docker Desktop, Proxmox, or changes to
the Windows/home-network default route.

The proof preserves workload source addresses and tests:

- routed `10.10.0.20 <-> 10.20.0.20` traffic through WireGuard;
- denial of `10.10.0.20 -> 10.20.0.30`;
- default-deny firewall policy and positive forwarding counters;
- simulated WAN partition and recovery; and
- exact namespace-only teardown while preserving ignored keys.

Run from PowerShell:

```powershell
wsl -d Ubuntu -u root --cd /home/landynsnipes/enterprise-mcp-kit sh demo/wireguard-netns/setup.sh
wsl -d Ubuntu -u root --cd /home/landynsnipes/enterprise-mcp-kit sh demo/wireguard-netns/verify.sh
wsl -d Ubuntu -u root --cd /home/landynsnipes/enterprise-mcp-kit sh demo/wireguard-netns/partition.sh down
wsl -d Ubuntu -u root --cd /home/landynsnipes/enterprise-mcp-kit sh demo/wireguard-netns/partition.sh up
wsl -d Ubuntu -u root --cd /home/landynsnipes/enterprise-mcp-kit sh demo/wireguard-netns/verify-recovery.sh
wsl -d Ubuntu -u root --cd /home/landynsnipes/enterprise-mcp-kit sh demo/wireguard-netns/verify-degraded-window.sh
wsl -d Ubuntu -u root --cd /home/landynsnipes/enterprise-mcp-kit sh demo/wireguard-netns/down.sh
```

`verify-degraded-window.sh` is the ten-minute AT-12 proof. It samples both
sites' local workload-to-router paths, the failed cross-site path, the denied
east-west path, and observer telemetry throughout the partition. A trap always
restores connectivity. The output and SHA-256 checksum are written under the
ignored `delivery-evidence/wireguard/` directory.

The namespace names and interface names are fixed. Setup deletes only those
five exact namespaces before rebuilding them. It never deletes keys, Docker
volumes, host interfaces, routes, or firewall rules.

Network namespaces live in WSL runtime state and disappear when Ubuntu stops.
Install `aiops-wireguard-netns.service` under `/etc/systemd/system/` and enable
it to rebuild the lab automatically on each WSL start. The unit invokes only
the version-controlled setup/down scripts and remains explicitly bounded to
the five fixed namespace names.

## Browser and monitoring

`aiops-wireguard-observer.service` exposes fixed, read-only evidence on
`127.0.0.1:9108`:

- `/` is the human review page;
- `/metrics` is Prometheus text exposition;
- `/health` is Zabbix HTTP-agent-ready JSON with HTTP 503 when degraded; and
- `/api/status` is the same bounded status document without health status-code
  semantics.

There are no mutation endpoints or request parameters. Collection executes
only fixed `ip`, `wg`, `ping`, and `nft` argument arrays and never returns keys.
Suggested Zabbix items are `$.healthy`, `$.allowedPathUp`,
`$.deniedPathBlocked`, and per-site `$.routers[*].handshakeAgeSeconds`.
Overall health requires a handshake newer than 180 seconds plus a successful
approved-path probe; it does not incorrectly require a new handshake for every
probe packet.
