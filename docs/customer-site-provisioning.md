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

The lab permission is record-type bounded rather than a production tenant
policy. Production execution additionally requires tenant-scoped NetBox
permissions, a transactional governance store, rate limits, durable audit
retention, and operational metrics. Recorded NetBox state is evidence of
configured inventory only; provisioning does not claim live device or network
state.

`npm run demo:provision:verify:full` creates and rolls back a 16-record,
tenant-scoped full-environment manifest. It verifies the returned record IDs
and compensation order for every created record. This is evidence of NetBox
inventory provisioning only; it does not provision a real VM, circuit, cable,
power system, or VPN tunnel.
