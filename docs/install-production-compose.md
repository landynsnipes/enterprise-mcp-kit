# Install the private Docker Compose production reference

## What this installs

The Compose bundle in `deploy/production/` runs a full NetBox Community and
governed MCP reference on one private Linux host:

```text
Internet or corporate ingress
  -> Caddy TLS proxy (ports 80/443)
      -> NetBox Community
      -> authenticated governance MCP (/mcp)
  -> private NetBox PostgreSQL + Valkey services
  -> private governance PostgreSQL audit store
```

Use a supported Linux host with Docker Engine and Docker Compose v2. Keep the
host patched, place it behind the approved firewall, and give it trusted DNS
names for NetBox and the MCP gateway. This is a single-host production
reference, not a high-availability topology.

## Before installation

1. Reserve two DNS names, such as `netbox.example.com` and `mcp.example.com`,
   that resolve to the host. Permit inbound TCP 80 and 443 only.
2. Prepare a real HTTPS OIDC issuer, JWKS endpoint, audience, tenant claim,
   and role mapping. The gateway accepts only the fixed planner, approver,
   executor, and auditor roles.
3. Prepare a secret manager or root-owned secret-injection process. Do not put
   secrets in Git, shell history, images, or the repository checkout.
4. Define retention, backup, restore, upgrade, incident-response, and support
   ownership before enabling write execution.
5. Build and scan the gateway image in CI, push it to an approved registry,
   and record its immutable digest. Do not use a mutable image tag in a
   production rollout.

## Install

Clone a reviewed release to the private host, then create a root-owned
environment file outside the checkout:

```sh
sudo install -d -m 0700 /etc/enterprise-mcp-kit
sudo install -m 0600 deploy/production/.env.example /etc/enterprise-mcp-kit/production.env
sudoedit /etc/enterprise-mcp-kit/production.env
```

Replace every placeholder, set the two public hostnames, supply the actual OIDC
configuration, and set `GOVERNANCE_IMAGE` to the CI-built image digest. Run the
preflight gate before starting services:

```sh
deploy/production/scripts/preflight.sh /etc/enterprise-mcp-kit/production.env
docker compose --env-file /etc/enterprise-mcp-kit/production.env -f deploy/production/compose.yaml pull
docker compose --env-file /etc/enterprise-mcp-kit/production.env -f deploy/production/compose.yaml up -d
```

Verify container health on the host, complete NetBox bootstrap, create the
dedicated read-only MCP service account, and validate the five read tools
against a non-production instance before connecting an AI client.

## Enable governed writes

Writes are disabled by default. Do not change either execution flag merely to
make a test pass. Before setting `GOVERNANCE_EXECUTION_ENABLED=true` or
`GOVERNANCE_PROVISIONING_ENABLED=true`, complete all of the following:

1. Approve the exact action capability, tenant/site boundary, and rollback
   policy.
2. Create separate, least-privilege NetBox writer and provisioner identities.
3. Inject their tokens only through the host's approved secret mechanism.
4. Prove planner/approver/executor separation and an end-to-end rollback in a
   non-production environment.
5. Record the change approval and release digest.

The gateway still restricts writes to the implemented capability allowlists;
it never becomes a generic NetBox API proxy.

## Operate, back up, and upgrade

Back up NetBox PostgreSQL, NetBox media, and governance PostgreSQL separately.
Test restores into an isolated host, retain the release image digest and the
matching environment template, and keep the prior release available for
rollback. Follow `docs/production-reference-operations.md` for the permission
matrix, recovery drill, upgrade gate, metrics, and audit requirements.

For an update, first run the test suite and release gates against the candidate
source and image. Change only the governance image digest and reviewed NetBox
image digest in a controlled release record, run `docker compose up -d`, then
verify the five read-only tools and the gateway health. Roll back by restoring
the recorded prior image digests and validated backups; never downgrade a live
database without the documented restore procedure.
