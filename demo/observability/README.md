# Local observability slice

This Compose project runs pinned Prometheus and Grafana OSS containers against
the bounded native-WSL WireGuard observer and governed cloud-event services. It
does not expose a generic host, network, Docker, NATS, Ansible, or Kubernetes
control surface.

- Prometheus owns metric collection and source-specific WireGuard and
  cloud-event alerts.
- Grafana is a localhost-only, anonymous Viewer presentation layer. Its data
  source and dashboard are read-only, version-controlled provisioning files.
- Zabbix is intentionally not included in this slice. Its later responsibility
  is host/service availability via the observer's `/health` endpoint, not a
  duplicate copy of Prometheus metric rules.

The containers use host networking solely so they can reach the observer bound
to WSL loopback. Both web listeners also bind only to `127.0.0.1`. This is a
local single-host portfolio proof, not physical two-site HA.

Review URLs:

- Prometheus: <http://localhost:9090/>
- WireGuard dashboard: <http://localhost:3000/d/aiops-wireguard-two-site/>
- Cloud-event dashboard: <http://localhost:3000/d/aiops-cloud-event-operations/>
- Cloud-event API metrics: <http://localhost:8790/metrics>
- Cloud-event worker metrics: <http://localhost:8791/metrics>
- Runtime evidence: <http://localhost:9108/>
- NetBox intended state: <http://localhost:8000/>

Use `../wireguard-netns/partition.sh` and `verify-recovery.sh` for the bounded
failure test. A partition should make `WireGuardSiteConnectivityDegraded` fire;
recovery should resolve it after fresh evidence arrives.

The cloud-event dashboard separates availability, durable queue depth, API
governance decisions, request latency, and bounded worker outcomes. Its panels
are technical operational evidence only: they do not approve actions or imply
autonomous remediation. Run `npm run cloud-events:verify` for the authenticated
accept/replay/conflict proof and `npm run cloud-events:verify:recovery` for the
broker-loss and recovery proof.
