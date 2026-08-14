# Service health and dependency matrix

This contract covers the long-running services installed by the published lab.
It distinguishes point-in-time readiness from recovery evidence: a healthy
probe does not prove that a service recovers after its dependency fails.

Run the fixed, read-only inventory as WSL root:

```bash
npm run aiops:health:verify
```

The verifier checks 25 exact services and accepts no command, URL, container,
namespace, or target input. It writes a sanitized ignored artifact with a
correlation ID, decision trace ID, per-service mechanism and dependency, bounded
latency, result, and artifact checksum.

## Coverage groups

| Layer | Services | Readiness mechanism |
| --- | --- | --- |
| NetBox and identity | PostgreSQL, two Valkey roles, NetBox web, NetBox worker, Keycloak | Container health plus fixed loopback HTTP |
| Cloud events | NATS JetStream, event API, event worker | Fixed loopback readiness endpoints |
| Operations | Zabbix PostgreSQL, Zabbix Server, Zabbix web, Prometheus, Grafana | Container health, native runtime diagnostic, and fixed loopback HTTP |
| Delivery | GitLab, GitLab Runner | GitLab readiness and runner registration verification |
| WSL observers | WireGuard observer, Kubernetes CPU observer, cloud-reference review endpoint | Fixed loopback health endpoints |
| Kubernetes | LAS and CHI workloads, CoreDNS, Metrics Server, Traefik, local-path provisioner | Deployment rollout readiness |

Docker and Kubernetes are host/platform dependencies rather than application
checks in this inventory. Their loss invalidates multiple rows simultaneously;
it is not presented as independent-site failure because all services share the
same physical WSL host.

## Dependency-failure evidence

| Dependency failure | Expected behavior | Current evidence | Status |
| --- | --- | --- | --- |
| WireGuard observer process stops | Prometheus reports the target unavailable; a reviewed fixed action may restart only the admitted service; unhealthy verification fails closed | Governed incident evaluation and live observer restart proof | Executed |
| LAS application service is removed | LAS becomes unavailable while CHI remains ready; LAS is restored to its recorded replica count | GitLab F2 site-service-loss job and checksum-bearing artifact | Executed on logical sites |
| LAS/CHI connectivity is partitioned | Local site paths remain available; cross-site path fails closed; prohibited path remains blocked; telemetry continues | AT-12 622-second WireGuard partition evidence | Executed on logical sites |
| Kubernetes workload enters high CPU | Metrics API evidence is collected, Prometheus alert fires, injected workload is removed, alert clears | AT-05 F1 high-CPU evidence | Executed |
| Post-action telemetry disappears | Outcome must be `non-success`, never verified success | AT-09 evaluator regression test | Deterministic negative test |
| NATS broker restarts | API/worker readiness reflects dependency state; queued event processing resumes without duplicate mutation | `demo/cloud-events/scripts/verify-broker-recovery.sh` | Executed |
| NetBox PostgreSQL data must be restored | Restore into an isolated pinned PostgreSQL container and compare bounded inventory counts; primary lab remains unchanged | AT-11 NetBox restore evidence | Executed restore, not live outage |
| Governance PostgreSQL data must be restored | Restore into an isolated pinned PostgreSQL container and compare state, audit, and plan counts | AT-11 governance restore evidence | Executed restore, not live outage |
| Zabbix PostgreSQL stops | Zabbix Server and web must become non-ready and recover only after PostgreSQL readiness returns | Health dependencies are declared; live injection not yet run | Open destructive test |
| Prometheus local TSDB fails | Prometheus readiness fails; Grafana panels show telemetry unavailable rather than healthy | Readiness probes are enumerated; live injection not yet run | Open destructive test |
| K3s Metrics API fails | Kubernetes CPU observer returns unavailable evidence and AT-09 records non-success | Deterministic evaluator negative test; live Metrics API outage not run | Partially executed |

## Claims boundary

Passing the health inventory proves that installed services answered their
bounded readiness mechanisms at one point in time. Only rows marked executed
support recovery or degraded-operation claims. The matrix does not prove
independent-site HA, physical disaster recovery, production scaling, or
autonomous remediation.
