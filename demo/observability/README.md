# Local observability slice

This Compose project runs pinned Prometheus and Grafana OSS containers against
the bounded native-WSL WireGuard observer, Kubernetes CPU observer, and governed cloud-event services. It
does not expose a generic host, network, Docker, NATS, Ansible, or Kubernetes
control surface.

- Prometheus owns metric collection and source-specific WireGuard and
  cloud-event alerts. Kubernetes CPU values come from Metrics Server runtime
  evidence, never NetBox intended state.
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
- Kubernetes workload dashboard: <http://localhost:3000/d/aiops-kubernetes-las-workload/>
- Cloud-event API metrics: <http://localhost:8790/metrics>
- Cloud-event worker metrics: <http://localhost:8791/metrics>
- Runtime evidence: <http://localhost:9108/>
- Kubernetes CPU evidence: <http://localhost:9109/api/status>
- NetBox intended state: <http://localhost:8000/>

Use `../wireguard-netns/partition.sh` and `verify-recovery.sh` for the bounded
failure test. A partition should make `WireGuardSiteConnectivityDegraded` fire;
recovery should resolve it after fresh evidence arrives.

Run `npm run aiops:kubernetes:verify:high-cpu` for the bounded F1 proof. It
creates one constrained, digest-pinned LAS load pod, waits for the source-owned
Prometheus alert, removes the pod through an exit trap, verifies alert recovery,
and writes checksum-bearing evidence under the ignored `delivery-evidence/`
directory. This is deliberate failure injection, not autonomous remediation.

Run `npm run aiops:kubernetes:verify:telemetry-loss` for the deterministic AT-05
negative proof. It feeds the observation evaluator three otherwise healthy
samples with unavailable observer telemetry and requires a `non-success`
outcome plus the `telemetry_unavailable` failure. The resulting checksum-bearing
artifact records the state as unknown; it does not stop a live observer or
claim a live Metrics API outage.

The cloud-event dashboard separates availability, durable queue depth, API
governance decisions, request latency, and bounded worker outcomes. Its panels
are technical operational evidence only: they do not approve actions or imply
autonomous remediation. Run `npm run cloud-events:verify` for the authenticated
accept/replay/conflict proof and `npm run cloud-events:verify:recovery` for the
broker-loss and recovery proof.
