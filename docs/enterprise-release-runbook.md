# Enterprise release and rollout runbook

Use this runbook after the repository checks pass and before enabling this
reference in a customer environment. It deliberately distinguishes repeatable
repository evidence from customer-owned deployment decisions.

## Release evidence produced by this repository

The `Release gate` GitHub workflow runs on production-delivery changes, `main`,
and version tags. It validates the code and distribution, fails on high or
critical production dependency advisories, builds the governance image, scans
that image for high or critical known vulnerabilities, and retains a CycloneDX
SBOM for 90 days. Its actions are pinned to immutable commit IDs.

Create a release only when both `Validate` and `Release gate` pass for the
commit being tagged. Record the tag, commit SHA, NetBox image digest,
governance image digest, SBOM artifact, scan outcome, and approver in the
release record.

## Image publication and signature

This repository intentionally does not publish to a registry or create a
signature because that requires the customer’s registry namespace and trusted
signing identity. After an approved CI build publishes an image, an operator
must sign the immutable digest with the organization’s approved signing policy
and verify it on the deployment host before setting `GOVERNANCE_IMAGE`:

```sh
cosign verify <organization-policy-flags> registry.example.com/enterprise-mcp-kit-governance@sha256:<digest>
```

Use the verified `@sha256:` reference in the root-owned production environment
file. Never deploy a mutable tag such as `latest`.

## Non-production acceptance

On a customer-controlled non-production host, with real DNS, TLS, OIDC, and
secret injection configured, run:

```sh
deploy/production/scripts/preflight.sh /etc/enterprise-mcp-kit/production.env
docker compose --env-file /etc/enterprise-mcp-kit/production.env -f deploy/production/compose.yaml up -d
deploy/production/scripts/acceptance.sh /etc/enterprise-mcp-kit/production.env
```

Then validate the five read-only MCP tools using the intended AI client and a
dedicated read-only NetBox account. Prove the account cannot write. Validate
the governed MCP independently: planner, approver, executor, and auditor must
use separate identities; planning and denial paths work while execution is
disabled; and a complete create-and-rollback test occurs only in non-production
after the write credentials and approval policy are reviewed.

## Production entry criteria

- Separate development, non-production, and production environments exist.
- DNS, TLS renewal, firewall rules, OIDC issuer/audience, role mapping, and
  tenant boundaries have a named owner and approved change record.
- Secrets are injected from an approved store; no lab credentials or customer
  data are committed or baked into images.
- The NetBox and governance databases, NetBox media, logs, and backups use
  appropriate separate storage and retention for the customer’s requirements.
- A restore drill has succeeded on an isolated host; backups are not accepted
  merely because they were created.
- Monitoring covers container health, HTTPS/TLS, OIDC failures, MCP request
  failures/latency, audit-store failures, disk capacity, and backup success.
- The customer has accepted the single-host reference architecture, or has
  supplied an approved HA, replication, and failover design. This repository
  does not claim to provide HA by itself.

## Enable writes only after acceptance

Keep `GOVERNANCE_EXECUTION_ENABLED=false` and
`GOVERNANCE_PROVISIONING_ENABLED=false` until all entry criteria are complete.
When a bounded capability is approved, enable only the required flag, use a
tenant-scoped least-privilege NetBox credential, perform the planned and
approved action with separate identities, verify the audit trail, and rehearse
the documented rollback.
