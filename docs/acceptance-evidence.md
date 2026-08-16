# Acceptance evidence ledger

Updated 2026-08-13. This ledger maps the architecture contract to executed,
sanitized evidence. Runtime artifacts under `delivery-evidence/` are intentionally
ignored because they contain timestamps and local execution context; commands,
schemas, and verification logic remain version controlled.

Hiring-manager narrative of the same numbers:
[AT evidence case study](at-evidence-case-study.md).
Threats mapped to these tests: [threat model](threat-model.md).

| Test | Status | Current evidence | Remaining limitation |
| --- | --- | --- | --- |
| AT-01 clean rebuild | Partial | Pinned Compose, K3s manifests, OpenTofu plan, systemd units, and repeatable setup scripts; GitLab pipeline 7 rebuilt both logical workloads | Full empty-host timed rebuild and second-run configuration diff are not yet recorded |
| AT-02 ownership | Passed | `node scripts/verify-ownership-reconciliation.mjs` ran as WSL root after governed LAS/CHI provisioning and observed all 10 intended/runtime ownership records; correlation `at02-20260814T181203130Z`, decision trace `dtr_at02_ownership_v1`, artifact SHA-256 `f9053711688234548042c6aa02c2f54d2246421778db01c98fe1e52e24dbc0a1` | NetBox records intended inventory/topology only; live electrical state remains unknown and both logical sites share one WSL physical failure domain |
| AT-03 least privilege | Passed for implemented workflows | Role-separation and cross-tenant tests; GitLab deployer negative tests for Secrets, namespace deletion, Chicago scaling, and ReplicaSet mutation | Does not assert controls for components not yet installed on independent hosts |
| AT-04 east-west restriction | Partial | WireGuard allowed path and denied CHI path; K3s default-deny policies; AT-12 partition proof | A probe for every architecture zone-pair row is still open |
| AT-05 observability | Passed for F1 and telemetry-loss negative path | `demo/observability/verify-f1-high-cpu.sh`; Prometheus alert fired in 61 seconds at 199.893218 millicores; Grafana UID `aiops-kubernetes-las-workload`; evidence SHA-256 `96785c4c987d768e5fd59456f268bd4931148a30758246a95acd681bf833d898`. `npm run aiops:kubernetes:verify:telemetry-loss` also proves three healthy-replica samples with unavailable observer telemetry produce `non-success`, `telemetry_unavailable`, and an explicit unknown state | Live Metrics API outage remains a separate destructive test; this negative proof intentionally does not disrupt a running service |
| AT-06 plan integrity | Passed for implemented schemas | Automated tests reject stale evidence, unknown fields, mutated digests, cross-trace plans, and malformed or secret-bearing WireGuard intent. Offline recommendation eval `incident-recommendation-eval-1.0.0` replays nine adversarial fixtures without calling a model | Live-model evaluation is implemented; no live-model baseline has been published. Offline scores are not model quality |
| AT-07 human approval | Passed | Three-person separation, exact digest, expiry, tenant, replay, and rejection tests; GitLab LAS/CHI/F2/rollback jobs remain manual | Local GitLab root is a lab operator identity, not production federation |
| AT-08 bounded execution | Passed for implemented actions | Fixed Ansible observer action, fixed K3s scripts, exact target namespaces, dry-run server validation, and idempotency tests | No generic shell, Kubernetes, Ansible, or vendor API is exposed to the LLM |
| AT-09 verification/outcome | Passed for LAS workload | `npm run aiops:kubernetes:verify:post-action`; 21 samples over 310 seconds after the pipeline 7 LAS rollback/restore; 2/2 replicas always ready, zero unavailable replicas, zero restart increase, 21/21 telemetry samples available, maximum aggregate CPU 0.20895 millicores, and zero firing high-CPU alerts; evidence SHA-256 `d03049b0ec6d9e8a6d1780cdd7c92d225fb1f81bda7d7fbb6ee452f1a627a01c` | Proves one logical LAS workload on the shared WSL host, not every action type or an independent-site production observation window |
| AT-10 rollback | Passed for LAS workload | GitLab pipeline 7 rollback job 50 succeeded; desired-state restore job 51 succeeded; prior Kubernetes revision and checksum-bearing artifacts retained by GitLab | Chicago rollback remains available but unexecuted |
| AT-11 backup restore | Passed for NetBox and governance PostgreSQL | NetBox counts `6|22|5`, dump SHA-256 `3b0a3824280d1deef72d76c8b913bb30a00126cc41ac04392c3df071f3f9e9db`; governance counts `1|5|5`, dump SHA-256 `0729b41331e9fdbbd1da7517f18ec7ebf2023720bae4e735f36307596fa2832f`; both restored into disposable pinned PostgreSQL containers | Lab proves database restore, not independent-host disaster recovery or encrypted off-host retention |
| AT-12 degraded operation | Passed for logical WireGuard topology | 622-second partition, 20 samples, local paths available, cross-site path failed closed, prohibited path blocked, telemetry continued; SHA-256 `269df48ca7dbc2d356a5bd8580c1e8de62351e95ee6b3afd3699952d0c792d32` | Both logical sites share one WSL host and physical failure domain |
| AT-13 secret/data hygiene | Passed for committed history | Gitleaks 8.30.1 full-history scan across 31 commits and about 1.28 MB; release archive verified with SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`; two exact historical fingerprints are documented synthetic idempotency-key fixtures; CI scan is mandatory and redacted | Scan does not certify ignored local files or operator secret stores; those remain outside Git by policy |
| AT-14 health/readiness | Passed for installed service inventory | `npm run aiops:health:verify`; 25/25 fixed checks passed across NetBox/identity, cloud events, Zabbix/Prometheus/Grafana, GitLab/Runner, WSL observers, LAS/CHI workloads, and core K3s deployments; decision trace `dtr_at14_service_health_v1`; evidence SHA-256 `c9972c71eda7e8b5136ddb2967133c7f9955da6d0208522b2bdcc9fdcde8eba7`; recovery status is separated in the [service health and dependency matrix](service-health-and-dependency-matrix.md) | Zabbix PostgreSQL loss, Prometheus TSDB failure, and live Metrics API loss remain explicitly open destructive tests; point-in-time readiness is not recovery proof |

## Claims boundary

The current lab proves governed recommendations and actions, logical two-site
topology, bounded execution, runtime verification, rollback, and isolated
database recovery. It does not prove independent-site high availability,
physical disaster recovery, production scale, or autonomous remediation.
