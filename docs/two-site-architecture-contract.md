# Two-Site Open Enterprise AIOps Architecture Contract

Status: proposed Phase 0 contract; no platform components are installed by this document.
Evidence date: 2026-08-11.
Review gate: implementation starts only after this contract and its unresolved decisions are reviewed.

## 1. Purpose and claims boundary

This contract defines a public, reproducible demonstration of governed enterprise AIOps across two **logical** sites: Las Vegas (`LAS`) and Chicago (`CHI`). Both may initially run on one physical workstation. The lab therefore demonstrates topology, isolation, recovery procedures, and failure behavior; it does **not** demonstrate physical-site high availability, disaster tolerance, or production capacity.

The operational loop is:

```text
authorized evidence -> deterministic eligibility checks -> untrusted AI explanation
-> strict plan validation -> different human approves exact plan -> bounded Ansible action
-> runtime telemetry verifies -> outcome recorded -> compensate or roll back when required
```

NetBox is authoritative only for intended inventory, topology, addressing, circuits, and recorded power context. Proxmox, Kubernetes, Zabbix, Prometheus, and Ansible remain authoritative for their own runtime facts. No generic shell, Kubernetes API, Ansible runner, hypervisor API, or vendor API is exposed to an LLM.

The published lab uses sanitized fictional identifiers, RFC 1918 addressing, documentation prefixes, and synthetic telemetry. It contains no customer data, production URLs, credentials, private keys, or reusable secrets.

## 2. Evidence baseline: implemented versus planned

Evidence was gathered from the working tree, source, tests, package manifest, distribution inventory, and existing documentation. A listed test or script is repository evidence, not a claim that it was executed successfully during this architecture-only phase.

| Capability | State on 2026-08-11 | Repository evidence | Phase 0 interpretation |
| --- | --- | --- | --- |
| Five bounded NetBox context tools | Implemented and tested with mocks; live lab verification scripts exist | `src/mcp-server.ts`, `src/netbox-client.ts`, `test/mcp-server.test.ts`, `test/netbox-client.test.ts` | Reuse; NetBox evidence remains bounded and non-runtime |
| Exact device, site, connectivity, rack, and recorded power context | Implemented | README adapter contract and NetBox client tests | Direct connectivity evidence is not a live forwarding-path claim |
| Strict plan/approve/reject/execute/audit contract | Implemented | `src/governance.ts`, `src/governance-mcp.ts`, governance tests | Reuse lifecycle and strict schemas |
| Tenant scoping and fixed role-to-capability mapping | Implemented | `src/governance-capabilities.ts`, identity and tenant-boundary tests | Extend scopes; never accept model-invented scope |
| Separate planner, approver, and executor identities | Implemented for governed NetBox actions | governance and provisioning tests; OIDC verification scripts | Preserve separation for every operational action |
| Durable PostgreSQL audit/governance storage | Implemented with tests and live verification script | `src/governance-postgres-storage.ts`, durability tests | Candidate system of record for decisions and outcomes |
| Bounded NetBox metadata writes and site provisioning | Implemented, disabled by default, with verification/rollback proofs | writer/executor source and tests; `demo:*:verify` scripts | These are inventory changes, not runtime remediation |
| Health, metrics, rate limits, host protection, OIDC | Implemented for governance HTTP gateway | gateway/config/observability source and tests | Extend telemetry with trace IDs and readiness dependencies |
| LAS/CHI Proxmox, Kubernetes, Ansible, Zabbix, Prometheus, Grafana platform | Planned; no implementation evidence found | roadmap only | Do not describe as deployed or integrated |
| AI retrieval/recommendation pipeline and incident evaluation suite | Planned | roadmap only | Must be built behind strict contracts and approval |
| Site connectivity, backup restore, degraded operation | Planned | roadmap only | Must be proved with repeatable tests before claims |
| Hybrid-cloud extension | Deferred | roadmap Phase 6 | Optional and never a core dependency |

## 3. Logical topology and trust zones

Each site is an independent failure and policy cell even when both are virtualized on one host. Site CIDRs are placeholders subject to collision checks before implementation.

```text
                         OPERATOR / CI ZONE
                 browser, Git, review, approval client
                                |
                         TLS + OIDC/RBAC
                                v
                   GOVERNANCE AND IDENTITY ZONE
        Keycloak/OIDC -- Enterprise MCP Kit -- PostgreSQL audit
               |          bounded reads/plans         |
               |          signed exact approvals      |
               +----------------+----------------------+
                                |
                 fixed service identities + allowlists
               _________________|_________________
              /                                   \
     LAS logical site                         CHI logical site
  10.10.0.0/16 candidate                  10.20.0.0/16 candidate
  +----------------------+                 +----------------------+
  | management zone      |                 | management zone      |
  | Proxmox, K3s API,     |<--WireGuard---->| Proxmox, K3s API,     |
  | Ansible targets      |  allowlisted    | Ansible targets      |
  +----------+-----------+  site flows     +-----------+----------+
             |                                         |
  +----------v-----------+                 +-----------v----------+
  | workload zone        |                 | workload zone        |
  | K3s pods/services    |                 | K3s pods/services    |
  | default deny policy  |                 | default deny policy  |
  +----------+-----------+                 +-----------+----------+
             | metrics/health only                     | metrics/health only
  +----------v-----------+                 +-----------v----------+
  | observability zone   |                 | observability zone   |
  | Zabbix/Prometheus    |                 | Zabbix/Prometheus    |
  | Grafana views        |                 | local degraded view  |
  +----------+-----------+                 +-----------+----------+
             \____________ approved telemetry ________/
                                |
                         DATA / BACKUP ZONE
             NetBox intended state, audit DB, encrypted backups
```

### Zone rules and flows

| Source | Destination | Allowed purpose | Default rule |
| --- | --- | --- | --- |
| Operator/CI | Git, OIDC, governance ingress, read-only dashboards | Review, authentication, exact approval, evidence viewing | TLS only; no direct workload administration in normal workflow |
| Enterprise MCP Kit | NetBox, Prometheus query endpoint, bounded Zabbix evidence endpoint | Tenant/site/target-scoped retrieval | Read-only service identities; fixed operations and response bounds |
| Enterprise MCP Kit | Ansible controller | Submit one schema-valid, approved action ID and digest | Deny unless unexpired approval, capability, tenant, target, and idempotency checks pass |
| Ansible controller | Named target group | Admitted module/playbook operation only | No arbitrary command payload; host allowlist; short-lived credential |
| Prometheus/Zabbix | Site workloads and infrastructure exporters/agents | Metrics, health, availability | Pull/push ports explicitly listed; no management API reuse |
| Grafana | Prometheus/Zabbix data sources | Read-only visualization | Dedicated read-only identities |
| LAS | CHI | WireGuard control/data flows explicitly required by a scenario | Deny all other inter-site traffic; no stretched Kubernetes control plane |
| Platform services | PostgreSQL/data zone | Application-specific persistence and audit | Per-service database roles; encrypted transport; no shared superuser |
| Backup runner | Approved data sources and backup target | Versioned encrypted backup/restore | Write-only where practical; restore uses separate approval and identity |

Every workflow carries `correlation_id`, `decision_trace_id`, tenant, site, target, evidence timestamps, plan schema version, model/prompt version when AI is used, approval identity/time, execution ID, and outcome. Structured logs must exclude tokens, secret values, and raw sensitive payloads.

## 4. Source-of-truth and runtime ownership

| Component | Authoritative for | Not authoritative for | Reconciliation rule |
| --- | --- | --- | --- |
| NetBox | Intended sites, racks, devices, VM inventory, prefixes/IPs, VLANs, circuits, cable relationships, recorded power context, ownership metadata | Live reachability, forwarding path, CPU, pod health, electrical delivery | Compare identifiers and intended attributes with runtime observations; never overwrite runtime truth |
| Proxmox VE | VM/LXC existence, placement, power state, allocated resources, task results, hypervisor/storage runtime health | Business ownership or intended network/circuit design | Map immutable runtime IDs to NetBox records; drift is evidence requiring a plan |
| Kubernetes (K3s candidate) | API-observed workloads, desired Kubernetes objects, pod/node status, rollout and scheduling state | Physical inventory, WAN/circuit state, hypervisor truth | Git declares manifests; cluster status verifies applied state; NetBox supplies context, not pod truth |
| Zabbix | Host/service availability, infrastructure events, trigger state, agent observations | Desired topology and Kubernetes metrics ownership | Correlate by stable site/service IDs; do not duplicate Prometheus rule ownership without justification |
| Prometheus/Alertmanager | Time-series metrics, scrape health, metric alert evaluation, bounded retention | Intended inventory or durable decision/audit history | Evidence includes query, labels, range, sample time, and staleness |
| Grafana | Dashboard/panel definitions, data-source presentation, operator annotations | Underlying metric truth, approvals, execution outcomes | Dashboards link to source timestamps and decision trace; no control-plane writes |
| Ansible | Playbook/run definition, inventory snapshot used, check/run result, changed targets, compensation result | Intended inventory ownership or live health outside run facts | Execute only version-pinned admitted playbooks against resolved target IDs; record before/after |
| Keycloak/OIDC | Human/service identity, authenticated claims, role assignment source | Application authorization decision or approval content | Gateway maps only admitted roles to fixed capabilities and rechecks tenant/scope |
| PostgreSQL | Durable plans, approvals, executions, audit events, idempotency records, outcomes | Infrastructure runtime state | Append lifecycle evidence; constrain updates by state/version; back up and restore-test |
| Enterprise MCP Kit | Bounded tool contracts, authorization enforcement, evidence lineage, decision lifecycle orchestration | Vendor/runtime truth and human judgment | Reject unknown fields, stale evidence, scope expansion, self-approval, digest mismatch, and replay conflicts |

## 5. Component decisions (ADR-0001)

Decision status: proposed. Versions are candidate pin points, not blanket approvals. Before installation, resolve each exact package/image version and digest, verify its upstream release/security status, license and transitive contents, record it in the machine-readable distribution inventory, and define an upgrade/rollback owner.

| Area | Proposed decision | Reason and tradeoff | License/health/operations gate |
| --- | --- | --- | --- |
| Virtualization | Proxmox VE 9.x on the physical host; two isolated logical site groups | Strong open virtualization story and VM lifecycle/backup tooling. Nested or single-node layout proves behavior, not HA. | AGPLv3 project; pin repository/package snapshot; review Debian base, hardware virtualization, ZFS/storage memory cost, and supported upgrade path |
| Kubernetes distribution | One single-server K3s cluster per logical site; do not stretch a cluster across WAN | K3s is CNCF-conformant and lightweight; separate clusters make partition behavior explicit. Single-server clusters sacrifice control-plane HA intentionally. | Apache-2.0; choose a supported minor and exact `+k3s` patch at implementation. Current official docs show 2 cores/2 GiB server minimum; budget workload capacity separately |
| CNI/network policy | Start with K3s-packaged Flannel plus kube-router network policy | Lowest Phase 1 burden and sufficient default-deny policy proof. It lacks the richer identity/flow visibility of Cilium. | Pin via the selected K3s release; revisit Cilium only after a demonstrated eBPF/visibility requirement and kernel/resource test |
| Ingress | K3s-packaged Traefik, one ingress endpoint per site | Removes an extra controller while supporting TLS routes. Avoids adopting another ingress during foundation work. | Pin transitively with K3s; disable admin dashboard externally; define trusted proxies, TLS, and route ownership |
| Service exposure | ClusterIP by default; explicit host/ingress ports for the lab | Minimizes exposed surface. A bare-metal load balancer adds little value on one host. | No NodePort wildcard ranges; document each opened port; evaluate MetalLB only if multiple LAN-addressable nodes exist |
| Kubernetes storage | Local-path storage only for disposable workloads; PostgreSQL and durable services stay outside Kubernetes initially | Simple and honest on a single host. It provides no site resilience, so stateful failover is not implied. | Pin provisioner with K3s; require backup/restore before any durable workload; evaluate replicated storage only with independent disks/nodes |
| Secrets | SOPS + age-encrypted values in Git; deployment key supplied out of band; Kubernetes Secrets encrypted at rest | Fully open and reviewable with no plaintext secrets. Key custody and rotation remain operator work. | Record SOPS/age versions and recipients; never commit private keys; negative scan required |
| GitOps/config | Git is desired-state authority; Ansible applies hosts/Proxmox/site connectivity; Flux reconciles Kubernetes manifests later | Keeps Phase 1 narrow and establishes one-way reconciliation. Flux adds controllers and is deferred until Kubernetes exists. | Pin Ansible collections by version/hash and Flux images by digest; signed/reviewed changes; no live manual patch as accepted state |
| Backup | Proxmox vzdump for VMs plus application-native PostgreSQL/NetBox backups, encrypted to a host path outside the VM set | Restore can be proved locally without cloud. Same-host copies do not prove disaster recovery. | Define RPO/RTO, retention, encryption, checksums, restore drills; later copy one encrypted artifact to an independent target |
| Site connectivity | WireGuard tunnel between LAS and CHI router VMs with explicit firewall allowlists | Small, auditable, open-source, easy to partition for tests. On one host it is a logical WAN only. | Pin OS/packages; keys out of Git; restrict routes; test deny rules and key rotation |
| Identity | Existing Keycloak/OIDC pattern; separate human and service clients | Reuses tested issuer/audience/authorized-party/JTI/tenant/role checks | Pin image digest; MFA for human approval when practical; export realm config without secrets; test expiry/revocation |
| Observability | Prometheus/Alertmanager owns metric rules; Zabbix owns host/service availability; Grafana is read-only presentation | Avoids ambiguous duplicate alert ownership while demonstrating complementary tools | Pin images/digests; bounded retention; readiness and storage alerts; synthetic public data only |
| Optional cloud | Defer to Phase 6; first candidate is encrypted backup-object create/verify/destroy | Proves identity, IaC, cost controls, recovery and teardown without core dependency | Provider selected later; budget cap and teardown evidence required; local lab must pass while extension is absent |

### Version and license inventory already confirmed in this repository

| Existing component | Confirmed tested/pinned evidence |
| --- | --- |
| NetBox Community / NetBox Docker | 4.6.5 / 5.0.2; Apache-2.0; container pinned by digest |
| PostgreSQL | 18; PostgreSQL License; container pinned by digest |
| Valkey | 9.1; BSD-3-Clause; container pinned by digest |
| Keycloak | Container pinned by digest; exact friendly version/license review still required in distribution inventory |
| MCP TypeScript SDK | 1.30.0; MIT |
| Zod | 4.4.3; MIT |
| TypeScript | 5.9.3 installed; Apache-2.0 |

## 6. Governed action contract

An action is executable only when all of these hold:

1. Evidence was retrieved through allowlisted, read-only, tenant/site/target-scoped operations and is within its type-specific freshness window.
2. Deterministic rules mark the scenario eligible. AI may explain or propose parameters inside an admitted action type; it may not invent action types, targets, credentials, or policy.
3. The AI result conforms to a closed schema with no unknown fields and includes evidence references, uncertainty/missing data, model version, prompt version, schema version, expiry, and rollback preconditions.
4. The plan resolves immutable target IDs and a versioned Ansible playbook plus bounded parameters. Its canonical digest is stored.
5. A different authorized human approves that exact unexpired digest. The planner/recommender cannot approve, and the approver cannot become the executor for that plan.
6. A dedicated executor identity submits the plan ID and idempotency key. Ansible receives only the resolved inventory and admitted module parameters—never model-authored shell or playbook text.
7. Check mode/preconditions pass, prior state is captured, execution is correlated, and telemetry observes a fixed verification window.
8. Outcome is recorded as improved, unchanged, worsened, inconclusive, rolled back, or rollback-failed. Non-improvement does not silently become success.

Until one low-risk action has positive, replay, stale-evidence, unauthorized-scope, self-approval, tampered-digest, failed-verification, and successful-rollback evidence, the public term remains **governed AI-assisted operations**, not autonomous remediation.

## 7. Failure scenarios

### F1: workload failure or sustained high CPU in LAS

- Inject: constrain or load one synthetic Kubernetes workload until a versioned Prometheus rule fires; optionally terminate one pod for the failure variant.
- Detect: Prometheus owns CPU/pod metrics and rule evaluation; Zabbix may open a service-level incident without claiming the metric itself; Grafana shows source timestamps.
- Decide: deterministic checks validate tenant, target, replica bounds, capacity guardrail, evidence freshness, and maintenance policy. AI explains evidence and proposes only the admitted replica adjustment or restart action.
- Act: a different human approves the exact plan; Ansible invokes a fixed Kubernetes automation role through a narrow service identity.
- Verify: readiness, error rate, CPU, desired/available replicas, and alert state are observed for a fixed window.
- Recover: rollback to recorded replica/workload state if guardrails breach or service does not improve. Replay must not repeat a completed mutation.

### F2: loss of a site service

- Inject: stop the LAS synthetic application endpoint or its local observability collector, one service at a time.
- Detect: local and remote checks distinguish workload loss from monitoring loss; missing telemetry is `unknown`, never healthy.
- Operate degraded: CHI continues its local workload and local monitoring. Operators can read the last durable decision history. No automatic DNS or traffic failover is claimed in Phase 0/1.
- Recover: rebuild/restart the named service from version-controlled configuration, confirm readiness and data consistency, and attach recovery evidence to the incident.

### F3: loss of site connectivity

- Inject: deny the WireGuard path between router VMs while keeping both site networks running.
- Detect: tunnel/remote probes fail and alerts identify a partition; local site health remains separately visible.
- Operate degraded: each site continues local workloads and collection. Cross-site writes, approvals requiring unreachable evidence, and stale recommendations fail closed. No split-brain mutation is allowed.
- Recover: restore the tunnel, verify routes and allowlists, reconcile queued/read-only telemetry with timestamps, expire stale plans, and prove no duplicate execution occurred.

## 8. Measurable acceptance tests

| ID | Test and pass condition | Required evidence |
| --- | --- | --- |
| AT-01 clean rebuild | From a documented host baseline and empty lab state, recreate both logical sites using pinned artifacts with zero manual in-guest edits; second run is idempotent | Git commit, lock/digest inventory, command log, elapsed time, configuration diff = empty on replay |
| AT-02 intended/runtime ownership | For sampled VM, IP, pod, CPU alert, and power record, each displayed fact names its owner and timestamp; NetBox is never cited for live state | API/query captures and reconciliation report with explicit unknowns |
| AT-03 least privilege | Planner cannot approve/execute; approver cannot plan/execute; executor cannot plan/approve; cross-tenant and out-of-site requests return deny without target data | Positive and negative identity tests, sanitized audit events |
| AT-04 east-west restriction | Required flow matrix succeeds; at least one prohibited flow per zone pair is blocked; workload-to-management and arbitrary inter-site access are denied | Firewall/network-policy manifests and probe results |
| AT-05 observability | Inject F1 and receive a source-owned alert within 2 minutes; dashboard shows health, metric timestamp, site, service, and trace; telemetry loss renders unknown within 2 scrape intervals | Alert payload, query/rule version, dashboard capture, timestamps |
| AT-06 plan integrity | Unknown fields, invented targets, stale evidence, excessive replicas, prompt-injected instructions, and modified plan digests are rejected before approval | Schema/rule negative tests and rejection audit events |
| AT-07 human approval | Execution cannot begin without a different authorized human approving the exact unexpired digest; rejection and expiry remain non-executable | Identity claims, lifecycle events, digest comparison |
| AT-08 bounded execution | Approved playbook and target allowlist are fixed; check mode passes; one idempotency key produces at most one mutation | Playbook version/hash, inventory snapshot, check/run output, replay result |
| AT-09 verification/outcome | After action, collect at least 5 minutes of readiness, errors, CPU, replicas, and alert state; success requires defined thresholds, otherwise outcome is non-success | Before/after queries and durable outcome record |
| AT-10 rollback | Forced failed verification restores recorded prior state within 5 minutes; subsequent health meets baseline; rollback failure is a visible critical outcome | Prior-state record, rollback run, telemetry, audit chain |
| AT-11 backup restore | Restore NetBox and governance PostgreSQL into clean instances; checksums/schema checks pass and sampled plans/inventory match; perform quarterly in the demo lifecycle | Backup manifest, encryption/checksum evidence, restore log, reconciliation report |
| AT-12 degraded operation | During F3, both local workloads remain ready for 10 minutes, local telemetry continues, cross-site mutation fails closed, and reconnect causes no duplicate action | Partition timeline, local probes, denied mutation, post-reconnect audit query |
| AT-13 secret/data hygiene | Repository scan finds no private keys, tokens, production/customer identifiers, or plaintext secret manifests | Scan command/version and clean result |
| AT-14 health/readiness | Every long-running service exposes or has an active health/readiness probe; dependencies failing make readiness fail without erasing liveness evidence | Probe definitions and dependency-failure test |

Acceptance evidence must include UTC timestamps, tool/query versions, correlation and decision trace IDs where applicable, sanitized inputs, expected result, actual result, and artifact checksum. Screenshots alone do not pass a test.

## 9. Hardware and capacity discovery

### Confirmed local facts (read-only inspection, 2026-08-11)

| Resource | Confirmed |
| --- | --- |
| Host | ASUS system, AMD Ryzen 7 5800X, 8 physical cores / 16 logical processors |
| Host memory | 34,267,725,824 bytes (~31.9 GiB) installed |
| WSL-visible memory | 19 GiB total, 18 GiB available at inspection; 8 GiB swap |
| WSL root filesystem | 1007 GiB total, 854 GiB available |
| Windows volumes | C: ~88 GiB free; D: ~3.46 TiB free; E: ~1.66 TiB free |
| Failure domains | One physical host confirmed; disk/controller/network/power independence not established |

These facts do not confirm Proxmox compatibility, nested-virtualization performance, disk endurance, network-interface count, or sustained workload headroom.

### Discovery checklist before Phase 1

- [ ] Confirm whether Proxmox will be bare metal or nested; record BIOS AMD-V/IOMMU state and accept the rebuild impact.
- [ ] Inventory physical disks by model, media, controller, SMART health, endurance, and which volume may be erased. Never infer disposable storage from free space.
- [ ] Inventory NIC count/speed/driver, switch/VLAN capability, Wi-Fi limitations, and management recovery path.
- [ ] Measure idle and peak CPU/RAM/disk IOPS for the existing NetBox lab; retain 25% host RAM and two logical CPUs for host safety.
- [ ] Draft per-VM budgets. Initial ceiling for WSL-visible capacity: LAS 4 vCPU/6 GiB, CHI 4 vCPU/6 GiB, shared governance/data 2 vCPU/4 GiB, leaving at least 3 GiB plus swap margin. Do not allocate until measured.
- [ ] Confirm K3s nodes meet the official baseline (server: 2 cores/2 GiB before workload resources) and use SSD-backed storage.
- [ ] Estimate telemetry cardinality, scrape intervals, and retention disk use; set quotas before load tests.
- [ ] Measure full backup size, backup duration, restore duration, and temporary space requirement (minimum two complete backup sets plus one restore workspace).
- [ ] Confirm an independent backup target before making any disaster-recovery claim.
- [ ] Record power/UPS and thermal constraints; a single PSU/UPS remains one failure domain.
- [ ] Run a 60-minute representative load with both sites and monitoring; pass only with no swapping under steady state, no storage saturation, and at least 20% CPU/RAM headroom.

## 10. Availability, recovery, and operating assumptions

Initial demonstration targets are test objectives, not service-level commitments:

- local synthetic workload readiness: recover within 5 minutes of an admitted F1 action;
- governance decision history: PostgreSQL restore point objective 24 hours and restore time objective 60 minutes until measured evidence supports tighter values;
- site partition: local workloads remain available for the 10-minute test; cross-site governed mutations fail closed;
- monitoring: alert detection within 2 minutes for the flagship rule and explicit `unknown` on telemetry loss;
- backups: daily encrypted application backups, retention of 7 daily and 4 weekly copies for the lab, with quarterly restore proof.

The shared physical host, storage, upstream network, and power are common-mode failures. Logical site recovery on that host cannot validate disaster recovery.

## 11. Unresolved decisions and review gates

1. Bare-metal versus nested Proxmox and which storage may be used safely.
2. Exact Proxmox 9.x and K3s supported patch versions/digests at implementation time.
3. Whether the initial site router is a minimal Debian VM or a dedicated open-source firewall distribution; WireGuard behavior is fixed either way.
4. Exact per-VM resource budgets after baseline measurement.
5. Whether Keycloak, NetBox, and governance PostgreSQL run in a shared services zone or have explicitly tested warm recovery in CHI.
6. Exact Zabbix/Prometheus responsibility boundary for the first alert to prevent duplicate paging.
7. The first admitted Ansible remediation. Candidate: bounded replica adjustment for one synthetic workload; restart is simpler but demonstrates less intent reconciliation.
8. Independent backup target and key-custody procedure.
9. Whether later Cilium/Flux adoption solves a measured gap worth its operational cost.
10. Optional cloud provider and spend ceiling; this remains deferred.

No component admission is complete until license, exact version/digest, security advisories, release cadence, maintainer activity, upgrade path, rollback path, and named operational owner are reviewed.

## 12. Smallest recommended implementation slice

Implement only the two-site network and inventory skeleton first:

1. Add sanitized LAS/CHI sites, prefixes, VLANs, router/service VM intent, and one recorded WireGuard circuit/tunnel relationship to NetBox using the existing governed provisioning pattern.
2. Create two isolated Linux router/service VMs (or equivalent disposable VMs if Proxmox placement is not yet approved) from pinned configuration.
3. Establish the WireGuard link with a default-deny inter-site firewall and one permitted health probe.
   Until Proxmox is available, `demo/wireguard-two-site` implements this as an
   explicitly labeled Docker container simulation with isolated internal
   networks. It proves tunnel and policy behavior, not VM lifecycle or HA.
   The preferred WSL workaround is now `demo/wireguard-netns`: native network
   namespaces prove routed workload traffic and denial without Docker bridge
   behavior. It still does not prove Proxmox lifecycle or physical HA.

Windows review startup is handled by `scripts/windows/Start-AiopsLab.ps1`.
It maintains one marked hidden WSL client, waits for NetBox and the WireGuard
observer, and can open both localhost pages. Systemd owns service startup and
clean shutdown; the launcher does not widen network exposure.
4. Prove `AT-01`, `AT-02`, `AT-03`, `AT-04`, and the connectivity portions of `AT-12`, including teardown/rollback.

Do not add Kubernetes, the observability stack, or AI remediation to this slice. This establishes truthful site identity, intended-versus-runtime ownership, governed change, isolation, partition behavior, and rebuild evidence with the fewest new moving parts.

## 13. Primary references used for candidate decisions

- Proxmox VE Administration Guide: <https://pve.proxmox.com/pve-docs/pve-admin-guide.html>
- K3s documentation and packaged components: <https://docs.k3s.io/>
- K3s requirements: <https://docs.k3s.io/installation/requirements>
- K3s release channels and pinning: <https://docs.k3s.io/upgrades/manual>
- Repository component policy: [`../THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md)
- Repository distribution gates: [`../ENTERPRISE-DISTRIBUTION.md`](../ENTERPRISE-DISTRIBUTION.md)
