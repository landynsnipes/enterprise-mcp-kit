# Production-reference operations

This document describes the operator responsibilities for a production
reference deployment. It does not make the evaluation Compose file a
production topology and it does not enable NetBox writes.

## Deployment boundary

Run the MCP service, NetBox, OIDC provider, database, cache, and observability
services in separate production environments. Keep databases, Valkey, and
internal MCP services on private networks. Expose only a TLS-terminating
reverse proxy with a trusted DNS name. Do not expose NetBox, Keycloak, database,
or cache ports directly to the public network.

Production OIDC configuration must use HTTPS issuer and JWKS URLs, a named
audience, and a verified tenant and role claim mapping. The loopback HTTP OIDC
exception exists only for the local identity lab and must remain disabled in
every deployed environment.

Inject NetBox tokens, database credentials, OIDC client secrets, and TLS keys
from the operator's secret store or mounted secret files. Do not reuse the
generated lab `.env`, local Keycloak admin account, or demo users.

## Image provenance

The evaluation Compose manifest references these exact validated OCI digests:

| Component | Version reference | OCI digest |
| --- | --- | --- |
| NetBox Community / NetBox Docker | 4.6.5 / 5.0.2 | `sha256:691ec1a4f569f3dfb9fefd9f086cca1b39689ad59c3eae753712a741447e5e60` |
| PostgreSQL | 18.4 (`18-alpine`) | `sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` |
| Valkey | 9.1.1 (`9.1-alpine`) | `sha256:ee91f7a174ac4d6a6b0685b3a60e321f0a9dbbb691f9b0e285be2ba1d1be8328` |
| Keycloak local identity lab | 26.0.7 | `sha256:4388e2379b7e870a447adbe7b80bd61f5fbf04e925832b19669fda4957f05a81` |

Before changing a digest, record source provenance, license and vulnerability
review, a clean deployment test, and a rollback image. Pinning is immutable
deployment input, not a substitute for vulnerability management.

## NetBox least-privilege roles

Create a dedicated, non-staff NetBox account or service account. Grant only
`view` permissions for the model families needed by the deployed tool set; do
not grant add, change, delete, object-permission administration, token
administration, or staff/superuser privileges.

| Bounded tool | Required read model families |
| --- | --- |
| `get_device_context` | DCIM devices, sites, device roles, device types, manufacturers, platforms; IPAM IP addresses; custom fields exposed on devices |
| `get_site_overview` | DCIM sites, devices, racks; circuits; tenancy contact assignments; custom fields exposed on devices and sites |
| `get_connectivity_path` | DCIM sites, devices, interfaces; circuits and circuit terminations; VPN tunnels and tunnel terminations |
| `get_rack_context` | DCIM racks, sites, locations, devices, power feeds; custom fields exposed on devices |
| `get_power_path` | DCIM devices, racks, power ports, power outlets, power feeds, cables, and connected PDU devices |

Validate these permissions against a non-production NetBox instance with a
write-disabled token before each release. A 403 response is a configuration
failure, not a reason to broaden the token.

## Governance and audit boundary

The governance HTTP gateway accepts only verified OIDC access tokens. It may
create, approve, reject, and retrieve tenant-scoped dry-run plans; it exposes
no executor and must not be configured with a NetBox write token. Store
governance snapshots and audit events on durable, access-controlled storage;
back up and restore that store together with the operational records required
for audit retention.

The pre-write gate admits only `planner`, `approver`, and `auditor` roles and
maps them to fixed capabilities in application code. Unknown realm roles grant
no governance access. A plan initiator cannot approve or reject that plan even
if the identity has both roles. Every mutation requires an `Idempotency-Key`;
the local reference persists request digests and receipts atomically so an
identical retry returns the original result and conflicting reuse is denied.
Production deployments must replace the single-process file store with a
transactional, access-controlled store that provides cross-instance locking
and append-only audit retention before enabling execution.

## Backup, restore, and rollback

For the pinned local reference, run `npm run demo:recovery:verify` after the
minimal seed. It creates a PostgreSQL-format backup, restores it to a separate
temporary PostgreSQL container, compares only site, device, and rack counts,
then proves the primary lab's read-only MCP path remains unchanged. Its backup
and temporary restore container are removed automatically. It is a tested
backup/restore and recovery rollback drill.

Run `npm run demo:upgrade:verify` as the version-to-version release gate. The
gate creates a uniquely named disposable Compose project and volumes on
loopback port 18000, then proves all five read-only MCP tools at each stage:

1. NetBox Community 4.6.4 / NetBox Docker 5.0.1 at digest
   `sha256:094e0997eb8916d1e47dba8ac53e32427ee9639cd838512747b771421dff3c9b`;
2. forward migration to the current 4.6.5 / 5.0.2 pinned image;
3. restoration of the origin database backup and rollback to the origin image.

The gate refuses to run when port 18000 is occupied, never uses the active
`enterprise-mcp-kit-demo` project, does not print its disposable token, and
removes its project, volumes, and backup on exit. Passing proves recorded
inventory remains queryable through the bounded tools across this exact tested
pair. It does not prove live routing, forwarding, electrical state, or support
for any other upgrade origin.

Before declaring a production reference release, operators must record a test
that restores NetBox database and media backups into an isolated environment,
replays the selected image digests, and verifies the five read-only tools with
a dedicated token. Record the tested upgrade origin and a rollback to its prior
digest and database backup. Do not treat an untested backup as recoverable.

## Operational checks

Monitor container health, request IDs, authentication failures, NetBox adapter
latency and error rate, database capacity, cache health, and audit-store write
failures. Retain structured logs according to the organization's security and
audit policy. Exercise an OIDC signing-key rotation, secret rotation, and
restore drill before production use.
