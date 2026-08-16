# Customer site provisioning contract

The engineer workflow accepts one versioned manifest for one tenant and first
produces a deterministic dry run. The planner is intentionally separate from
execution and does not expose raw NetBox endpoints or payloads.

Version 1 bounds a request to one site, 0-64 VLANs, 0-64 prefixes, 1-20 racks,
1-50 devices, at most 16 interfaces per device, plus bounded virtual machines,
IP addresses, power panels and feeds, circuits, cables, and IPsec-tunnel
inventory. It validates exact tenant scope, names and slugs,
rack references and elevations, unique device/interface names, device type,
role and platform references, and IPv4/IPv6 addresses. The result contains a
canonical SHA-256 manifest digest, resource counts, conflicts, ordered steps,
and an explicit no-write boundary.

An interface may also carry bounded WireGuard intent. NetBox 4.6 does not
natively model WireGuard as a VPN tunnel encapsulation, so the kit does not
mislabel it as IPsec. Instead, the adapter creates a virtual NetBox interface,
assigns its tunnel address through native IPAM, and records only these custom
fields on the interface:

- remote site, device, and interface identifiers;
- 1-16 intended allowed prefixes;
- UDP listen port; and
- a SHA-256 public-key fingerprint used for reconciliation.

The manifest rejects same-site peers, missing tunnel addresses, malformed or
duplicate prefixes, ports outside 1-65535, malformed fingerprints, and unknown
WireGuard fields. In particular, a `privateKey` or raw public key is outside
the schema. Keys and runtime handshake state belong to the execution/telemetry
systems and must never be stored in NetBox or the governance plan.

```json
{
  "name": "wg0",
  "address": "10.255.0.1/30",
  "wireguard": {
    "peerSiteSlug": "northstar-chicago",
    "peerDeviceName": "ns-chi-edge-01",
    "peerInterfaceName": "wg0",
    "allowedPrefixes": ["10.20.0.0/16"],
    "listenPort": 51820,
    "peerPublicKeyFingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

Each site remains a separately approved manifest in version 1. The Phase 1
two-site orchestrator must cross-check that LAS and CHI peer identities,
addresses, and allowed prefixes are reciprocal before either Ansible
configuration is eligible for approval. This repository change records and
governs intended state only; it does not configure or assert a live tunnel.
VLAN IDs must be unique and between 1 and 4094. Prefixes must be unique valid
IPv4 or IPv6 networks and may reference only a VLAN declared in the same
manifest. Both resource families use fixed NetBox discovery/create/delete
endpoints and participate in the same digest and recorded-ID rollback.

The execution engine now binds its input to that digest, re-runs discovery
immediately before execution, creates through an adapter in dependency order,
preserves the ID returned for every record, stops on the first failure, and
compensates only records created by that execution in reverse dependency order.
Pre-existing records are never passed to compensation.

The NetBox adapter uses fixed discovery, create, and delete endpoints. The
disposable lab seeds a separate provisioner identity with view access to
references and view/add/delete access only to record types the adapter can
create. `npm run demo:provision:verify` performs a real dry run, binds execution
to its digest, creates a bounded site stack, verifies the recorded evidence, and
deletes only returned IDs in reverse dependency order.
`npm run demo:provision:verify:governed` additionally proves Keycloak planner,
approver, and executor separation, durable digest-bound approval, execution with
the dedicated credential, and rollback of the recorded creation set.
`npm run demo:governance:mcp:verify` proves the same lifecycle through the
authenticated Streamable HTTP MCP, including capability-protected audit
history and denial of planner execution.

`npm run demo:provision:verify:governed:postgres` runs a disposable
Northstar manifest through the same plan/approve/execute/rollback boundary
using the PostgreSQL governance store. It restarts the gateway, replays the
same execute idempotency key, and reads the plan and append-only audit history
after each restart. The retained lab database is an evidence fixture only; it
does not mutate the Las Vegas/Chicago intended baseline or claim live runtime
state.

The lab permission is record-type bounded rather than a production tenant
policy. Production execution additionally requires tenant-scoped NetBox
permissions, a transactional governance store, rate limits, durable audit
retention, and operational metrics. Recorded NetBox state is evidence of
configured inventory only; provisioning does not claim live device or network
state.

## Open Enterprise AIOps baseline

The two sanitized portfolio manifests use the explicit `open-enterprise-aiops`
NetBox tenant and the non-colliding management VLAN IDs 111 (LAS) and 211
(CHI). `npm run demo:seed` creates that tenant anchor and separate,
record-type-and-tenant-scoped provisioner permissions. `npm run
demo:identity:aiops` creates the distinct Keycloak planner, approver, and
executor identities with the same tenant claim.

`npm run demo:provision:aiops` is the initial governed plan, approval,
separation negative-test, execution, audit-read, and fixed-adapter workflow
for the two manifests. It intentionally retains the intended baseline
records; the execution response records the IDs needed for compensating
rollback. Use `npm run demo:provision:aiops:verify` after the baseline exists
for a read-only check of both sites and their addresses. The local evidence artifact is
`delivery-evidence/reconciliation/aiops-governed-provisioning.json`.

`npm run demo:provision:verify:full` creates and rolls back a 16-record,
tenant-scoped full-environment manifest. It verifies the returned record IDs
and compensation order for every created record. This is evidence of NetBox
inventory provisioning only; it does not provision a real VM, circuit, cable,
power system, or VPN tunnel.

## Two-site WireGuard rendering

The sanitized reciprocal examples are
`config/aiops/las-vegas.site.json` and `config/aiops/chicago.site.json`.
`validateTwoSiteWireGuardContract` requires one tenant, exact reciprocal peer
references, distinct endpoint addresses in the same IPv4 `/30`, and allowed
prefixes declared by the opposite site. It produces a deterministic pair
digest independent of input order.

Run `npm run aiops:wireguard:render` to validate the pair and render
`ansible/wireguard/inventory.generated.json`. The generated inventory is
ignored by Git and contains intended addresses, allowlists, peer fingerprints,
and environment-variable names only. It contains no key material. The bounded
role in `ansible/wireguard` accepts only `wg0`, requires an exact package
version through `WIREGUARD_UBUNTU_PACKAGE_VERSION`, renders one fixed template,
and enables only `wg-quick@wg0`. The package version must first be verified
against the exact approved router image; the repository does not guess it.

Rendering is not execution authorization. Before running the playbook, record
the pair digest in an approved action, inject both sites' private/public keys
out of band, run Ansible check mode, verify the peer public-key fingerprints,
and use the separate executor identity. Runtime handshake, route, packet-loss,
and health evidence must come from WireGuard and monitoring, not NetBox.

Run `npm run aiops:wireguard:preflight` only after injecting the four key
environment variables referenced by the generated inventory. Preflight checks
that every key is canonical 32-byte base64 and that each peer public key hashes
to the fingerprint approved in the reciprocal manifests. Its JSON output
contains the pair digest, decision trace ID, expiry, and validation results but
never key material. Passing preflight is evidence for an approval packet, not
approval and not permission to execute Ansible.
