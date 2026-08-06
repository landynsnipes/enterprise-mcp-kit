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
Pre-existing records are never passed to compensation. The engine is not yet
wired to a live NetBox provisioning credential or HTTP tool. Production execution requires a
transactional governance store, a tenant-scoped NetBox service identity, rate
limits, durable audit retention, and operational metrics.
