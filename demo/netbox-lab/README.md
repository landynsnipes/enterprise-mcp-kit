# Disposable NetBox lab

Pinned components: NetBox application 4.6.5 in NetBox Docker 5.0.2, Django 6.0.7, PostgreSQL 18, and Valkey 9.1. The lab follows the official NetBox Docker 5.0.2 service model: web, worker, PostgreSQL, task Valkey, and cache Valkey. NetBox web joins a normal frontend bridge and an internal backend bridge; every other service uses only the internal backend. Only NetBox is published, at `127.0.0.1:8000`. The generated `.env` is local-only and must not be committed.

The custom distribution also supplies a native default dashboard for enterprise
inventory, connectivity, power/cabling/services, MCP readiness, and operator
bookmarks. Reseeding resets dashboard state only for the disposable demo and
lab superuser accounts so configuration changes are visible immediately.

## Lifecycle

```sh
npm run demo:env
npm run demo:up
npm run demo:status
npm run demo:seed
npm run demo:verify
npm run demo:seed:showcase
npm run demo:verify:showcase
npm run demo:down
```

`demo:env` refuses to overwrite an existing environment. `demo:down` preserves
named volumes; it does not delete the lab database.

## Live demonstration

`demo:seed` idempotently creates sanitized inventory:

- Site: `Phoenix Lab`
- Manufacturer: `Example Networks`
- Device type: `Edge Router 1000`
- Role: `Edge Router`
- Device: `edge-phx-01`

It also creates a dedicated non-staff, non-superuser `demo-mcp` account, assigns
only device view permission, rotates a write-disabled NetBox v2 API token, and
stores its runtime configuration in ignored `.mcp.env` with mode `600`.

`demo:verify` proves:

- exact device lookup by name and ID through the HTTP adapter;
- mapping of only the approved `DeviceContext` fields;
- stdio MCP discovery of the bounded `get_device_context` and
  `get_site_overview` tools;
- a successful end-to-end MCP tool call;
- safe handling of a missing device; and
- a write-disabled NetBox credential.

The command prints only sanitized proof output. It must never print the token.

## Enterprise showcase

`demo:seed:showcase` adds three connected enterprise scenarios while preserving
the fast minimal smoke-test record:

- **Northstar Financial** — primary and disaster-recovery data centers,
  headquarters, production racks, a cabled edge-to-application path, circuits,
  VRF, VLAN, prefixes, and redundant rack power.
- **Summit Digital** — hybrid cloud edge, platform management, Kubernetes-style
  cluster, virtual machines, circuits, IPAM, and redundant rack power.
- **Atlas Managed Services** — shared colocation, managed core and firewall,
  customer transit network, provider circuit, operational ownership, and
  redundant rack power.

The deterministic showcase includes at least:

- 3 tenants and 5 sites;
- 5 populated 42U racks and 21 devices;
- 10 redundant power feeds, 80 PDU outlets, and connected A/B power paths;
- a connected Phoenix edge, firewall, core, and application cable path;
- 4 provider circuits;
- 3 VRFs, VLANs, and prefixes;
- 13 assigned IP addresses;
- 1 platform cluster and 3 virtual machines;
- operational contacts assigned to all showcase sites;
- platform and version evidence on every showcase device;
- OS and workload versions on all 3 showcase virtual machines and the platform cluster;
- 5 application and infrastructure services;
- concrete customer-side interfaces for all 4 circuit handoffs;
- 2 native NetBox VPN tunnels with 4 connected terminations; and
- explicit redundancy groups and failure domains.

`demo:verify:showcase` asserts these relationships and performs live MCP device
lookups for all three organizations. Re-running the showcase seed updates its
owned records without resetting the database.

The current MCP boundary includes exact, read-only device context and a bounded
site overview. Additional rack, circuit, power, connectivity, and
impact-analysis tools should be added as separate contracts rather than
exposing arbitrary NetBox queries.

Version fields deliberately separate observed, minimum-approved, compliance,
source, and observation time. They are sanitized desired-state evidence, not a
claim that NetBox performed live software discovery. In production, observed
versions should come from a trustworthy system with a recorded timestamp.

For example, `ns-phx-edge-01` reports Example Network OS `12.4.3` against an
example minimum-approved version of `12.4.0`. Summit VMs report Enterprise Linux
`9.6` separately from their Kubernetes, container runtime, CNI, and etcd
workload versions.

## Boundary

This is an evaluation environment, not a production NetBox deployment. Do not
reuse its secrets, sample identity, localhost networking, or availability model
in production.
