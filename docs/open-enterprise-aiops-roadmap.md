# Open Enterprise AIOps Platform Roadmap

## Portfolio thesis

Build a reproducible, open-source, multi-site infrastructure platform that proves the ability to design, automate, observe, govern, and recover enterprise systems end to end.

This is not a collection of dashboards or a chatbot attached to infrastructure. It is a controlled operational workflow:

```text
NetBox source of truth
  -> automation and desired state
  -> Proxmox and Kubernetes workloads
  -> Zabbix and Prometheus telemetry
  -> Grafana operational views
  -> AI-assisted diagnosis and recommendation
  -> human approval
  -> Ansible execution
  -> telemetry-based verification or rollback
```

The existing Enterprise MCP Kit remains the governed integration foundation. NetBox is the first reference system; later connectors should reuse the same bounded tools, tenant scope, approval, audit, and rollback patterns.

## Demonstration topology

The target showcase has two clearly separated sites and one deliberately small cloud extension:

- **Las Vegas:** primary site with a Proxmox cluster, Kubernetes workloads, NetBox-recorded inventory, and local monitoring.
- **Chicago:** recovery/secondary site with independent compute, replicated platform services where justified, and tested failover procedures.
- **Hybrid-cloud extension:** one bounded cloud workload or backup target that demonstrates identity, networking, deployment, and observability without making the lab dependent on paid cloud services.

The two sites must use explicit network boundaries. “East-west” in this roadmap means controlled service-to-service and site-to-site traffic, not unrestricted lateral connectivity. Network policy, firewall rules, service identities, and least privilege are part of the proof.

## Open-source platform roles

| Component | Role in the platform | Evidence the portfolio should show |
| --- | --- | --- |
| NetBox | Source of truth for sites, devices, addressing, circuits, power, and intended infrastructure context | Recorded multi-site topology, bounded MCP retrieval, governed changes, and drift evidence |
| Proxmox VE | Virtualization layer for the lab sites | Reproducible VM lifecycle, node/resource visibility, backup and recovery evidence |
| Kubernetes | Container orchestration for selected services and application workloads | Declarative deployment, health, scheduling, network policy, and controlled recovery |
| Ansible | Approved execution layer | Idempotent playbooks, inventory derived from approved source-of-truth data, dry runs, and rollback or compensation |
| Zabbix | Infrastructure and availability monitoring | Host/service discovery, alert evidence, dependencies, and incident initiation |
| Prometheus | Metrics collection and alert evaluation | Service and platform metrics, alert rules, labels, and bounded retention |
| Grafana | Operator-facing observability | Cross-site health, capacity, incident, governance, and recovery dashboards |
| Enterprise MCP Kit | Bounded context and governed action interface for AI clients | Strict schemas, RBAC, plan/approve/execute/rollback, audit lineage, and safe errors |

Adopt additional components only when they fill a demonstrated capability gap. Open-source licensing, maintenance health, security posture, and operational burden must be reviewed before admission.

## Governed incident workflow

The flagship scenario should be concrete and repeatable. A good first case is sustained CPU pressure on a Kubernetes workload in Las Vegas:

1. Prometheus records the condition and Zabbix opens the operational alert.
2. The AI workflow retrieves only authorized telemetry and NetBox context for the affected tenant, site, service, and dependencies.
3. Deterministic rules establish whether the alert is actionable. The LLM produces an explanation and bounded recommendation; its output is treated as untrusted and validated against a strict schema.
4. The recommendation records evidence, missing data, confidence, model and prompt versions, correlation ID, and expiration.
5. A human operator approves or rejects the exact plan. The recommender cannot approve or execute its own action.
6. Ansible performs only the admitted operation, such as changing a declared replica count or moving a bounded workload according to policy.
7. Prometheus and Zabbix verify the outcome during a defined observation window. Grafana shows before/after evidence.
8. Failure, non-improvement, or breached guardrails triggers compensation or rollback using recorded execution state.

The portfolio may describe this as **AI-assisted operations** or **governed AIOps**. “Autonomous remediation” should be reserved for a later, explicitly bounded class of low-risk actions after approval, replay, rollback, and outcome evidence are mature.

## Delivery phases

### Phase 0 - Architecture contract

The proposed Phase 0 decisions, topology, ownership boundaries, failure
scenarios, acceptance tests, and capacity evidence are in the
[two-site architecture contract](two-site-architecture-contract.md). Review
that contract and resolve its implementation gates before provisioning.

- Define the Las Vegas and Chicago logical topology, trust zones, service identities, availability targets, and failure assumptions.
- Define which records NetBox owns and which runtime systems remain authoritative for live state.
- Create an architecture decision record for Proxmox, Kubernetes distribution, CNI, ingress, storage, secrets, and backup choices.
- Define sanitized naming and data rules for public demonstrations.

**Exit evidence:** reviewed diagrams, component/version inventory, threat boundaries, acceptance tests, and a cost-free local execution plan.

### Phase 1 - Reproducible two-site foundation

- Represent both sites, addressing, circuits, racks, power, virtualization, and services in NetBox.
- Provision isolated lab networks and Proxmox-hosted VMs from version-controlled configuration.
- Establish secure site-to-site connectivity with explicit allowed flows.
- Prove rebuild, backup restore, and loss-of-one-site recovery procedures.

**Exit evidence:** clean rebuild from source, exact inventory reconciliation, tested restore, and documented rollback.

### Phase 2 - Kubernetes application platform

- Deploy one small cluster per site or another topology justified by the failure model.
- Add GitOps-style versioned manifests, health checks, resource requests/limits, network policies, and secrets injection.
- Run a small representative service whose recovery can be demonstrated safely.

**Exit evidence:** reproducible deployment, workload rescheduling, bounded failover test, and no manually patched configuration.

### Phase 3 - Unified observability

- Integrate Zabbix, Prometheus, and Grafana without duplicating unclear ownership.
- Add structured logs and correlation identifiers for operational and governance workflows.
- Build cross-site capacity, service health, alert, execution, and recovery dashboards.

**Exit evidence:** alert-to-dashboard trace, defined retention, health/readiness coverage, and observability during failure.

### Phase 4 - Source-of-truth-driven automation

- Add read-only connectors first for Zabbix, Prometheus, Grafana, Ansible, Proxmox, and Kubernetes where a bounded user job is proven.
- Generate an explainable desired-state plan from NetBox context.
- Run Ansible check mode, compare intended and observed evidence, require approval, execute with a narrow service identity, and verify the result.

**Exit evidence:** deterministic plan, least-privilege execution, idempotent replay, audit record, and tested rollback.

### Phase 5 - Governed AI operations

- Implement one incident workflow end to end before adding more alert types.
- Separate rules, retrieval, recommendation, explanation, approval, execution, and outcome tracking.
- Add prompt/model versioning, strict output contracts, evidence citations, uncertainty, stale-data handling, and injection defenses.
- Keep customer-impacting and infrastructure-changing actions human-approved.

**Exit evidence:** repeatable incident simulation, correct scope enforcement, recommendation evaluation, human approval trace, successful remediation proof, and negative/rollback tests.

### Phase 6 - Hybrid-cloud proof

- Add one small cloud-hosted workload, recovery target, or observability component through reproducible infrastructure as code.
- Demonstrate private connectivity, identity, secrets, deployment, monitoring, cost controls, teardown, and recovery.
- Keep the core platform operable when the cloud extension is unavailable.

**Exit evidence:** automated create/verify/destroy cycle, bounded spend, no committed secrets, and documented failure behavior.

## Portfolio deliverables

The public story should make the evidence easy to evaluate:

- one architecture overview and one detailed trust/data-flow diagram;
- separate “MCP only” and “full setup + MCP” paths for each supported open-source system;
- one-command or clearly sequenced evaluation setup with pinned versions;
- a two-site walkthrough with screenshots and sanitized evidence;
- an incident demo showing detection, evidence, recommendation, approval, execution, verification, and rollback;
- recovery and upgrade reports, not only happy-path screenshots;
- a clear list of what is implemented, simulated, planned, and operator-owned;
- commercial platforms such as Jira, ServiceNow, and Salesforce presented separately as custom consulting integrations, not bundled open-source distributions.

## Scope guardrails

- Do not claim production high availability from two processes or two virtual sites on one physical host. Call it a topology and failure-behavior demonstration until independent failure domains exist.
- Do not claim NetBox reports live routing, electrical delivery, CPU state, or workload health; use the runtime system that owns each fact.
- Do not expose generic shell, Kubernetes, Ansible, or vendor API tools to an LLM.
- Do not let an LLM self-approve, expand scope, invent targets, or execute stale recommendations.
- Do not make the initial milestone depend on every named component. Each phase must produce independently reviewable evidence.
- Do not add a cloud provider merely for a logo. The cloud slice must prove a specific architectural capability.

## Immediate next milestone

Create the **two-site architecture contract** before provisioning new infrastructure. It should choose the lab constraints and produce:

1. Las Vegas and Chicago topology and trust-zone diagrams.
2. A component/version/licensing matrix.
3. A source-of-truth ownership matrix covering NetBox, Proxmox, Kubernetes, Zabbix, Prometheus, Grafana, and Ansible.
4. Three failure scenarios: loss of a workload, loss of a site service, and loss of site connectivity.
5. Acceptance tests for rebuild, observability, approval, execution, verification, and rollback.
6. A hardware/capacity check that determines whether both sites can be simulated on the current equipment without false HA claims.

Only after that contract is reviewed should implementation begin with the smallest two-site foundation slice.
