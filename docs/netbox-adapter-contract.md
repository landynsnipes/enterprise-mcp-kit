# Implemented NetBox adapter contract

The first five tools answer bounded questions using exact identifiers. They do
not create, update, delete, enumerate broadly, or expose a generic NetBox API.

```text
AI client -> get_device_context -> NetBox REST API (read-only) -> evidence-bounded device summary
AI client -> get_site_overview -> fixed NetBox REST queries (read-only) -> bounded site summary
AI client -> get_connectivity_path -> fixed NetBox REST queries (read-only) -> circuit and VPN evidence
AI client -> get_rack_context -> exact rack plus bounded device query (read-only) -> rack elevation summary
AI client -> get_power_path -> exact device power ports, PDU outlets, and rack-feed evidence (read-only) -> bounded power-path summary
```

- Input: exactly one device `name` or numeric `id` unless a tool names a
  different exact identifier (site pair, rack, or device power path).
- Output: identity, status, site, role, device type, primary IP, platform,
  observed and minimum-approved software versions, compliance and evidence
  provenance, and source record reference, within each tool’s documented bound.
- Boundaries: no writes on stdio, no bulk enumeration, no arbitrary filters,
  and no secret values in tool output.
- Authentication: a least-privilege NetBox API token supplied only at runtime.
- Transport: GET only, configurable base URL, five-second default timeout.
- Base URL: HTTP and HTTPS are accepted for local labs; production policy must
  require HTTPS. Embedded URL credentials are rejected.
- Name lookup: query the NetBox device endpoint, then accept exactly one
  exact-name result.
- Errors: validation and HTTP failures are stable and never include tokens or
  raw response bodies.
- Site overview: at most 100 devices, with counts for racks, active circuits,
  contact assignments, and device software compliance. A `truncated` flag
  identifies evidence beyond that bound.
- Connectivity path: two exact, distinct site names; direct circuit and VPN
  evidence only. It does not calculate the runtime routed path.
- Rack context: exact rack ID or exact site and rack name; at most 100 racked
  devices ordered by elevation.
- Power path: follows recorded power ports through cabled PDU outlets to a
  matching recorded rack power feed where inventory supports it. It does not
  claim live electrical state, load, or breaker state.

See also [netbox-device-lookup.md](netbox-device-lookup.md) and
[connect-existing-netbox.md](connect-existing-netbox.md).
