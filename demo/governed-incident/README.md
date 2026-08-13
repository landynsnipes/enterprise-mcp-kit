# Governed incident proof

This slice proves one deliberately narrow action: restart
`aiops-wireguard-observer.service`. The recommendation is strict-schema,
evidence-linked, tenant-scoped, expires in at most 15 minutes, and cannot be
self-approved. Approval binds a canonical SHA-256 digest of the exact target,
action, evidence, prior state, tenant, rule/prompt versions, and expiry. The
digest is recalculated before execution so post-review mutation fails closed.
A third actor executes one fixed Ansible playbook. Success
requires a new systemd process identity and healthy bounded telemetry.

The live proof identities are labeled with their corresponding Keycloak demo
users. The core accepts only a trusted `GovernanceActor`; transport-level OIDC
verification remains the responsibility of the existing authenticated
governance gateway. The proof script itself does not handle passwords or tokens.

Run after `npm run build`:

```bash
sudo node scripts/prove-governed-incident.mjs --inject-observer-failure
```

The explicit flag deliberately stops only the observer as failure injection;
monitoring remains running and captures degraded evidence before approval. The
ignored `.runtime/latest-proof.json` contains the complete local audit
record. A restart changes no persisted configuration, so rollback is a recorded
state no-op: the pre-action active state must still be active and healthy. This
is human-approved remediation evidence, not autonomous remediation.

## Split OIDC approval proof

`scripts/governed-incident-cli.mjs` is the preferred proof path. Its prepare
phase verifies a planner access token against the Keycloak JWKS, injects the
fixed observer failure, records bounded evidence, and persists a private
`pending-plan.json`. It exits without approval or execution and prints the
exact plan ID, canonical digest, evidence, and expiry for human review.

The second phase requires fresh, separately verified approver and executor
tokens plus the reviewed plan ID and digest:

```bash
sudo --preserve-env=AIOPS_PLANNER_TOKEN npm run aiops:incident:prepare

sudo --preserve-env=AIOPS_APPROVER_TOKEN,AIOPS_EXECUTOR_TOKEN \
  npm run aiops:incident:execute -- \
  --plan-id '<reviewed-plan-id>' \
  --approval-digest '<reviewed-sha256>' \
  --reason 'Reviewed the exact target, evidence, expiry, and approval digest.'
```

Tokens are accepted only through process environment, are never persisted, and
must carry the exact admitted role. A wrong plan ID, wrong digest, expired plan,
mutated evidence, same-person role reuse, or failed post-action health check
fails closed. The observer remains intentionally degraded between phases, so an
operator must complete the reviewed action within the expiry window or
explicitly restore or reject the demonstration.
