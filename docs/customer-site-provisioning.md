# Customer site provisioning contract

The engineer workflow accepts one versioned manifest for one tenant and first
produces a deterministic dry run. The planner is intentionally separate from
execution and does not expose raw NetBox endpoints or payloads.

Version 1 bounds a request to one site, 1-20 racks, 1-50 devices, and at most
16 interfaces per device. It validates exact tenant scope, names and slugs,
rack references and elevations, unique device/interface names, device type,
role and platform references, and IPv4/IPv6 addresses. The result contains a
canonical SHA-256 manifest digest, resource counts, conflicts, ordered steps,
and an explicit no-write boundary.

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

The lab permission is record-type bounded rather than a production tenant
policy. Production execution additionally requires tenant-scoped NetBox
permissions, a transactional governance store, rate limits, durable audit
retention, and operational metrics. Recorded NetBox state is evidence of
configured inventory only; provisioning does not claim live device or network
state.
