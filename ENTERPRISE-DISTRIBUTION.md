# Enterprise distribution architecture

This repository supports two adoption paths without requiring an enterprise to
replace a working source of truth.

## Path 1: MCP for an existing NetBox

Organizations keep their NetBox deployment, data model, identity controls,
plugins, upgrade process, and operating procedures. They deploy only the MCP
server and grant it a dedicated read-only NetBox identity.

The connector must:

- require exact, bounded lookups;
- use fixed read-only API paths rather than arbitrary filters;
- tolerate absent optional custom fields;
- expose source references and evidence gaps;
- detect or document required object permissions per tool;
- never require this repository's demonstration schema; and
- remain usable without any optional plugin.

## Path 2: NetBox Community plus MCP reference distribution

Organizations starting fresh can use the repository's pinned NetBox Community
lab, versioned schema, compatibility manifest, sanitized examples, and MCP
workflows as an evaluation and implementation reference.

This path is upstream NetBox Community plus configuration. It is not a NetBox
fork, a managed service, or a claim that production operations are complete.

### Profiles

| Profile | Purpose | Production claim |
| --- | --- | --- |
| Minimal | Fast adapter and MCP smoke testing | None |
| Showcase | Rich sanitized infrastructure and workflow demonstrations | None |
| Production reference | Documented architecture and release gates for an operator-built deployment | Reference only until every release gate passes |

## Source-of-truth boundary

NetBox represents reviewed intended state. Discovery and monitoring systems
produce observed evidence. They must not silently overwrite intended state.

Every operational observation should carry:

- the observed value;
- the evidence source;
- the observation time;
- reconciliation status; and
- a reviewed exception reference when policy permits drift.

The MCP layer can explain differences and recommend a smallest safe action.
Future writes require a separate contract, narrow authorization, explicit human
confirmation, and an audit trail.

## Native model before custom field

Use native NetBox models for sites, locations, racks, devices, modules,
inventory items, cabling, power, interfaces, IPAM, circuits, VPNs,
virtualization, contacts, tenants, and services.

Use custom fields only when the enterprise concept has no suitable native
model. The versioned field catalog is
[`config/enterprise-custom-fields.json`](config/enterprise-custom-fields.json).

Do not duplicate lifecycle or contract data in custom fields after an admitted
lifecycle plugin becomes authoritative.

## FOSS component policy

The distribution must remain useful without a paid product, mandatory vendor
cloud, or proprietary runtime. Components and plugin candidates are controlled
by [`config/enterprise-distribution.json`](config/enterprise-distribution.json).

A plugin is not supported merely because it is open source. Admission requires:

1. license and dependency review;
2. compatibility with the pinned NetBox release;
3. clean installation and migration;
4. API and MCP integration tests;
5. backup and restore;
6. upgrade and rollback;
7. removal and data export; and
8. a documented compatibility range.

Unadmitted plugins remain optional candidates and cannot be required by core
MCP tools.

## Production operator responsibilities

An enterprise deployment must supply and operate:

- TLS and trusted DNS;
- SSO/MFA and role mapping;
- secret storage and rotation;
- database backup, point-in-time recovery, and restore testing;
- availability, capacity, and disaster-recovery design;
- monitoring, alerting, log retention, and audit export;
- image provenance and digest pinning;
- vulnerability and dependency management;
- maintenance windows and upgrade/rollback procedures;
- data ownership, retention, and reconciliation policy; and
- support ownership and incident response.

The evaluation Compose file is deliberately localhost-only and is not the
production topology.

## Image provenance and production operations

Every container artifact in the reference Compose file is pinned to the exact
OCI digest that was used for its local validation. Image tags are retained only
in comments as human-readable version references; operators must review and
intentionally update the digest, compatibility manifest, validation evidence,
and rollback record as one change.

The operator deployment baseline, least-privilege NetBox permissions, OIDC
requirements, and recovery runbook are in
[`docs/production-reference-operations.md`](docs/production-reference-operations.md).
It is a production-reference design, not a turnkey topology or authorization
to enable NetBox writes.

## Support envelope

Each release must state:

- supported NetBox application and distribution versions;
- supported MCP transport and client combinations;
- admitted plugin versions;
- database and Valkey versions;
- tested upgrade origins;
- tested scale bounds;
- known limitations; and
- end-of-support date.

Outside that envelope, the project may still work, but compatibility is not
claimed until tests prove it.

## Release gates

No release may be described as a production reference until:

- `npm run validate` passes;
- `npm run validate:distribution` passes;
- minimal and showcase live tests pass;
- all included components pass the license policy;
- container images are pinned by digest and their validation provenance is recorded;
- backup/restore and upgrade/rollback tests are recorded;
- least-privilege permissions are documented per MCP tool; and
- no generated secret, customer data, or internal endpoint is committed.
