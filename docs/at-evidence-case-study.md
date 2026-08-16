# Governed AIOps acceptance evidence case study

Status: narrative over already-executed lab evidence.
Source of truth: [acceptance evidence ledger](acceptance-evidence.md) (updated 2026-08-13).
This page invents no business metrics, customer outcomes, or production claims.

Live-model evaluation is implemented. **No live-model baseline has been
published yet.** See [incident recommendation eval](incident-recommendation-eval.md).

## Operational problem

Operations teams want help during incidents. They do not want a model to
search a fleet, invent a target, or execute a shell.

The question this lab answers is narrower:

> Can a bounded system observe a failure, keep AI output untrusted, require a
> different human to approve an exact plan, execute only an admitted action,
> verify the result in telemetry, and fail closed or roll back — and can those
> claims be measured?

## Constraints

- One physical WSL host. Las Vegas (`LAS`) and Chicago (`CHI`) are logical
  sites, not independent buildings.
- NetBox is authoritative for intended inventory and topology only. It is
  never cited as live electrical or runtime state.
- No generic shell, `kubectl`, Ansible runner, or vendor API is exposed to an
  LLM.
- Planner, approver, and executor are separate identities.
- Published artifacts use fictional identifiers and RFC 1918 addressing. There
  is no customer data in this repository.

## Architecture

```text
NetBox intended state
  → Ansible / desired state
  → Kubernetes workloads
  → Zabbix + Prometheus
  → Grafana
  → bounded recommendation (LLM output is untrusted)
  → human approval of an exact digest
  → admitted execution only
  → telemetry verification or rollback
```

The contract is [two-site-architecture-contract.md](two-site-architecture-contract.md).
The connectors you can point at an existing system are the supported product.
This page is the measured lab path, not a turnkey operations platform.

## What was executed

These are separate proofs against the same architecture. They are not one
continuous customer incident and they are not a production outage.

### Observe a failure

**AT-05** injected the F1 high-CPU path. Prometheus fired in **61 seconds** at
**199.893218 millicores**. Grafana dashboard UID
`aiops-kubernetes-las-workload`. Evidence SHA-256
`96785c4c987d768e5fd59456f268bd4931148a30758246a95acd681bf833d898`.

A separate telemetry-loss path proved that three healthy-replica samples with
unavailable observer telemetry produce `non-success`, `telemetry_unavailable`,
and an explicit unknown state. Missing telemetry is not treated as healthy.

### Keep the recommendation untrusted

**AT-06** rejects stale evidence, unknown fields, mutated digests, cross-trace
plans, and malformed or secret-bearing WireGuard intent.

The offline recommendation eval `incident-recommendation-eval-1.0.0` replays
nine adversarial fixtures without calling a model. Only the
`correct-restart` fixture is safe. Those scores measure the evaluator, not a
production model.

**AT-07** requires a different authorized human and the exact unexpired
digest. **AT-08** executes only fixed playbooks and exact targets. The model
never gains an execution path.

### Verify, then roll back

**AT-09** ran after GitLab pipeline 7 restored the LAS workload.
`npm run aiops:kubernetes:verify:post-action` collected **21 samples over 310
seconds**: 2/2 replicas always ready, zero unavailable replicas, zero restart
increase, 21/21 telemetry samples available, maximum aggregate CPU **0.20895
millicores**, zero firing high-CPU alerts. Evidence SHA-256
`d03049b0ec6d9e8a6d1780cdd7c92d225fb1f81bda7d7fbb6ee452f1a627a01c`.

**AT-10** for that same LAS workload: pipeline 7 rollback job 50 succeeded;
desired-state restore job 51 succeeded. Chicago rollback remains available and
unexecuted.

### Operate while partitioned

**AT-12** held a **622-second** logical WireGuard partition across **20
samples**. Local paths stayed available. The cross-site path failed closed.
The prohibited path stayed blocked. Telemetry continued. Evidence SHA-256
`269df48ca7dbc2d356a5bd8580c1e8de62351e95ee6b3afd3699952d0c792d32`.

### Ownership, restore, hygiene, and readiness

| Test | Measured result | Still unproved |
| --- | --- | --- |
| AT-02 ownership | 10/10 intended/runtime ownership records; correlation `at02-20260814T181203130Z`; SHA-256 `f9053711688234548042c6aa02c2f54d2246421778db01c98fe1e52e24dbc0a1` | Live electrical state; independent physical sites |
| AT-11 backup restore | NetBox counts `6\|22\|5`, dump SHA-256 `3b0a3824280d1deef72d76c8b913bb30a00126cc41ac04392c3df071f3f9e9db`; governance counts `1\|5\|5`, dump SHA-256 `0729b41331e9fdbbd1da7517f18ec7ebf2023720bae4e735f36307596fa2832f`; both restored into disposable pinned PostgreSQL containers | Independent-host disaster recovery; encrypted off-host retention |
| AT-13 secret hygiene | Gitleaks 8.30.1 full-history scan, 31 commits, about 1.28 MB; release archive SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` | Ignored local files and operator secret stores |
| AT-14 health | 25/25 fixed checks; decision trace `dtr_at14_service_health_v1`; SHA-256 `c9972c71eda7e8b5136ddb2967133c7f9955da6d0208522b2bdcc9fdcde8eba7` | Zabbix PostgreSQL loss, Prometheus TSDB failure, and live Metrics API loss |

**AT-01** (clean rebuild) and **AT-04** (every zone-pair probe) remain
partial. **AT-03** passed for implemented workflows only.

## Measured results in one place

| Measurement | Value | Test |
| --- | ---: | --- |
| High-CPU alert | 61 s at 199.893218 millicores | AT-05 |
| Post-action samples | 21/21 over 310 s | AT-09 |
| Ready replicas during that window | 2/2 | AT-09 |
| Max aggregate CPU after restore | 0.20895 millicores | AT-09 |
| Partition duration | 622 s, 20 samples, fail-closed | AT-12 |
| Ownership records | 10/10 | AT-02 |
| Service health checks | 25/25 | AT-14 |
| Offline recommendation fixtures unsafe | 8/9 (evaluator, not a model) | AT-06 |

## Limitations

The lab proves governed recommendations and actions, logical two-site
topology, bounded execution, runtime verification, rollback, and isolated
database recovery.

It does **not** prove:

- independent-site high availability
- physical disaster recovery
- production scale
- autonomous remediation
- live-model recommendation quality
- customer time-to-detect, time-to-repair, cost avoided, or adoption

GitLab root in the lab is an operator identity, not production federation.
Both logical sites share one WSL physical failure domain.

## How to replay the deterministic pieces

```sh
npm ci
npm run validate
npm run aiops:incident:evaluate
npm run eval:incident-recommendation
```

Those commands call no production LLM and spend no API money. Live connector
and destructive proofs stay on the commands named in the ledger.
