# Run the complete NetBox + MCP evaluation lab

Choose this path to evaluate a full NetBox environment and the MCP together
with sanitized, synthetic inventory. It is designed for demonstrations,
integration testing, and learning. It is not for production use.

## What the lab contains

- NetBox web and worker
- PostgreSQL and Valkey services
- A native NetBox dashboard with inventory, connectivity, power, and MCP-readiness views
- The five-tool read-only stdio MCP
- Optional local governance proofs for approval-gated writes and provisioning

Only NetBox web is published, on `127.0.0.1:8000`. Generated credentials and
runtime configuration stay local and are ignored by Git.

## Install and start

From a checked-out repository with Docker Engine and Docker Compose v2:

```sh
npm ci
npm run validate
npm run demo:env
npm run demo:up
npm run demo:status
npm run demo:seed
npm run demo:verify
```

`demo:env` creates the local secret file once and refuses to overwrite it.
`demo:seed` is repeatable. `demo:verify` proves all five read-only tools,
including an end-to-end stdio call, a missing-device response, and the
write-disabled demo token.

## Explore the enterprise showcase

```sh
npm run demo:seed:showcase
npm run demo:verify:showcase
```

The showcase contains three sanitized organizations across data centers,
hybrid cloud, and managed services. It includes rack elevations, cabling,
redundant A/B power evidence, circuits, IPAM, virtualization, contacts,
software posture, and VPN inventory. It is intentionally not representative of
any customer’s environment.

## Connect and use the local MCP

Start the stdio process using the local, write-disabled configuration created
by the seed:

```sh
set -a
. demo/netbox-lab/.mcp.env
set +a
npm run mcp:stdio
```

Point an MCP-capable AI client at that command, then use precise requests:

- “Show context for `edge-phx-01`.”
- “Show the overview for `Phoenix Lab`.”
- “Show direct evidence from `Phoenix Lab` to `Reno Lab`.”
- “Show rack `PHX-A01` at `Phoenix Lab`.”
- “Show the recorded power path for `edge-phx-01`.”

The exact tool contracts and their recorded-evidence limits are documented in
[Connect an existing NetBox deployment](connect-existing-netbox.md). The lab
MCP remains read-only even though optional governance tests exercise isolated
write workflows.

## Optional governed-write proofs

The lab can prove the approval-gated workflows separately. Run these only
after the minimal and showcase checks pass:

```sh
npm run demo:identity:up
npm run demo:identity:verify
npm run demo:write:verify
npm run demo:write:verify:software
npm run demo:write:verify:site
npm run demo:provision:verify
npm run demo:provision:verify:governed
npm run demo:provision:verify:full
npm run demo:governance:mcp:verify
npm run demo:governance:postgres:verify
npm run demo:provision:verify:tenant-boundary
```

The full-environment proof creates and rolls back a bounded, tenant-scoped
manifest covering site, VLAN, prefix, rack, devices, virtual machine, IP,
power panel/feed, circuit, IPsec-tunnel inventory, and cable records. It does
not configure real equipment, create a live network, or establish a VPN.

## Clean up

```sh
npm run demo:down
```

This stops the lab and preserves named volumes. The evaluation environment is
not a production deployment template. Do not reuse its secrets, identities,
localhost networking, availability model, or sample data in production. For a
clean self-hosted installation, follow the
[private Docker Compose production reference](install-production-compose.md).
