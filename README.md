# Enterprise MCP Kit

A reusable foundation for secure, job-oriented enterprise MCP connectors. Keep
the enterprise systems you already trust and add bounded AI tools that work with
real operational context.

## Choose your path

### 1. NetBox MCP — connect to an existing setup

Run only the MCP server and point it at your existing NetBox deployment. NetBox
remains your system of record; this project adds narrow, read-only operational
context tools for AI clients.

See [Connect an existing NetBox deployment](docs/connect-existing-netbox.md).

### 2. Full Custom NetBox + MCP — evaluation lab with sanitized data

Launch the optional Docker Compose lab with NetBox, PostgreSQL, Valkey, and the
supporting worker. The lab provides a reproducible environment for integration
testing and demonstrations without requiring an existing NetBox installation.

See [Run the complete evaluation lab](docs/run-complete-demo.md).

### 3. Full Custom NetBox + MCP — clean enterprise reference install

Use the private Linux Docker Compose reference for NetBox Community, the
governed MCP gateway, durable audit storage, and TLS ingress. It is a
single-host reference deployment with explicit operator responsibilities, not
the disposable lab.

See [Install the private Docker Compose production reference](docs/install-production-compose.md).
The required release evidence and customer deployment entry criteria are in the
[enterprise release and rollout runbook](docs/enterprise-release-runbook.md).

| Path | You supply | What you get | Intended use |
| --- | --- | --- | --- |
| NetBox MCP | An existing NetBox URL and read-only token | Five bounded read-only tools | Connect AI clients to approved inventory context |
| Full lab | A local Docker-capable workstation | Seeded, sanitized NetBox dashboard and read-only MCP | Evaluation, demonstrations, and integration tests |
| Clean enterprise reference | Private Linux host, DNS, OIDC, secret management, and operations ownership | NetBox Community, TLS ingress, governed MCP gateway, and durable audit store | A controlled self-hosted starting point—not HA or turnkey production |

The FOSS component policy, production boundary, plugin admission process, and
release gates are documented in
[Enterprise distribution architecture](ENTERPRISE-DISTRIBUTION.md). Component
licenses and candidate status are recorded in
[Third-party component policy and notices](THIRD_PARTY_LICENSES.md).

> The included NetBox environment is an evaluation and reference deployment,
> not a turnkey production NetBox distribution. Production operators remain
> responsible for identity, TLS, backups, upgrades, availability, and
> organization-specific deployment policy.

## First reference integration: NetBox operational context

The first five tools answer bounded questions: **what does NetBox know about this
device?** and **what infrastructure and software posture does NetBox record for
this site?**, and **what circuit and VPN evidence directly connects these two
sites?**, **what equipment and recorded power context is in this rack?**, and
**what recorded power path feeds this exact device?**
They retrieve explainable summaries using exact identifiers. They do
not create, update, delete, enumerate broadly, or expose a generic NetBox API
surface.

```text
AI client -> get_device_context -> NetBox REST API (read-only) -> evidence-bounded device summary
AI client -> get_site_overview -> fixed NetBox REST queries (read-only) -> bounded site summary
AI client -> get_connectivity_path -> fixed NetBox REST queries (read-only) -> circuit and VPN evidence
AI client -> get_rack_context -> exact rack plus bounded device query (read-only) -> rack elevation summary
AI client -> get_power_path -> exact device power ports, PDU outlets, and rack-feed evidence (read-only) -> bounded power-path summary
```

## Implemented adapter contract

- Input: exactly one device `name` or numeric `id`.
- Output: device identity, status, site, role, device type, primary IP, platform, observed and minimum-approved software versions, compliance and evidence provenance, and source record reference.
- Boundaries: no writes, no bulk enumeration, no arbitrary filters, and no secret values in tool output.
- Authentication: a least-privilege NetBox API token supplied only at runtime in the adapter options.
- Transport: GET only, with a configurable base URL and a five-second default timeout.
- Base URL: HTTP and HTTPS are accepted for local labs; production deployment policy must require HTTPS. Embedded URL credentials are rejected.
- Name lookup: queries the NetBox device endpoint, then accepts exactly one exact-name result.
- Errors: validation and HTTP failures are stable and never include tokens or raw response bodies.
- Site overview: at most 100 devices are summarized, with counts for racks,
  active circuits, contact assignments, and device software compliance. A
  `truncated` flag identifies evidence beyond that bound.
- Connectivity path: accepts two exact, distinct site names and returns only
  direct circuit and VPN evidence, participating devices/interfaces, addresses,
  evidence sources, completeness, and explicit unknowns. It does not claim to
  calculate or observe the runtime routed or forwarding path.
- Rack context: accepts an exact rack ID or exact site and rack name, then
  returns rack identity, dimensions, recorded power-feed count, and at most 100
  racked devices ordered by elevation with software posture.
- Power path: accepts exactly one device name or ID, follows its recorded power
  ports through cabled PDU outlets and each PDU's recorded input cable to a
  matching recorded rack power feed where the inventory supports it. It
  identifies A/B evidence and incomplete links, and explicitly does not claim
  live electrical state, load, breaker state, or actual power delivery.

## Repository layout

```text
demo/
  netbox-lab/                 # Optional NetBox evaluation environment
docs/
  connect-existing-netbox.md  # MCP with an existing NetBox deployment
  netbox-device-lookup.md
  run-complete-demo.md         # NetBox and MCP evaluation path
src/
  mcp-server.ts
  netbox-client.ts
  server-config.ts
  server.ts
test/
  mcp-server.test.ts
  netbox-client.test.ts
```

## Status

The repository also includes a provider-neutral, in-memory governance contract
for future consequential actions. It creates evidence-backed, tenant-scoped
action plans; maps only admitted OIDC roles to fixed capabilities; enforces
tenant isolation and initiator/approver separation; requires durable
idempotency keys for mutations; supports approval or rejection with expiry;
and records auditable lifecycle events. Its first optional write is deliberately
limited to the device fields `reconciliation_status`,
`observed_software_version`, and `minimum_approved_version`. A separate bounded
site-information path admits `physical_address`, `shipping_address`,
`description`, `facility`, and `time_zone`. Every write requires a third
`executor` identity, a captured prior value and `last_updated` version,
post-write verification, and a recorded rollback. RS256 access tokens must carry the
configured issuer, audience, authorized party, issued-at time, JWT ID, tenant,
and admitted roles. Execution remains disabled by default and requires an
explicitly enabled HTTP gateway plus a separate least-privilege NetBox token.
The unauthenticated stdio MCP surface remains read-only.

An authenticated stateless Streamable HTTP MCP is available at `/mcp` on the
governance gateway. It exposes eight strict tools for planning, reading,
auditing, approving, rejecting, executing, and rolling back admitted actions.
Every request requires a verified OIDC bearer token; mutations also require a
tool-level idempotency key. Host-header protection and per-identity rate limits
are enabled. `/healthz` reports governance-store readiness and `/metrics`
exports request, error, and latency counters for private operational scraping.

The governed gateway also supports a bounded customer-site manifest for one
tenant: one site, up to 64 VLANs, up to 64 prefixes, 1-20 racks, 1-50 devices,
and at most 16 interfaces per device, plus bounded virtual-machine, IP, power,
circuit, cable, and IPsec-tunnel inventory records. Planning performs
fixed-endpoint discovery and produces a canonical
digest without writing. A different approver must approve that exact digest
before a third executor may create records in dependency order through a
separate provisioner credential. The gateway records every returned ID and can
roll back only that creation set in reverse dependency order.

The read-only NetBox adapter and stdio MCP server are implemented with mocked
adapter and protocol tests. Live compatibility is verified against the included
NetBox Community 4.6.5 evaluation lab using sanitized inventory and a dedicated
write-disabled v2 API token. This verification covers the bounded
`get_device_context`, `get_site_overview`, `get_connectivity_path`,
`get_rack_context`, and `get_power_path` tools; it
proves the sanitized Phoenix-to-Reno private WAN and IPsec overlay, but does not certify a
production deployment.

## Local commands

```sh
npm install
npm run build
npm run typecheck
npm test
npm run validate
npm run validate:distribution
```

For the optional live evaluation:

```sh
npm run demo:seed
npm run demo:verify
npm run demo:seed:showcase
npm run demo:verify:showcase
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

The bounded-write proof changes the sanitized showcase device from `matched`
to `drifted`, verifies the exact response, replays the idempotent execution,
then restores `matched`. These are recorded metadata values, not claims about
live routing, electrical state, or actual configuration drift.
The software-version proof similarly records `12.4.4`, verifies it, and restores
`12.4.3`; it does not claim to inspect or change software running on a device.
The provisioning proofs create a disposable customer-site stack, verify the
recorded NetBox evidence, and remove it. The full proof additionally covers a
bounded virtual machine, IP, power, circuit, cable, and IPsec-tunnel inventory
set. The governed proof also
validates Keycloak planner/approver/executor separation and digest-bound
approval.

## References

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
- [NetBox REST API documentation](https://netbox.readthedocs.io/en/stable/integrations/rest-api/)

## License

Licensed under the [Apache License 2.0](LICENSE).
