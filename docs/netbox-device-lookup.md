# NetBox Device Lookup: Initial Tool Contract

## User job

An engineer investigating a delivery or incident needs a concise, source-backed summary of one known device without browsing NetBox manually.

## Proposed MCP tool

`get_device_context`

Input accepts exactly one of:

- `name`: exact NetBox device name
- `id`: NetBox numeric device ID

The implemented adapter calls only the corresponding `GET` endpoint under `/api/dcim/devices/`: `/api/dcim/devices/{id}/` for IDs and `/api/dcim/devices/?name={encoded-name}` for names. Name results must contain exactly one exact match. It returns only:

- device ID and name
- status
- site
- role
- device type
- primary IPv4 and IPv6, if present
- NetBox record URL or ID as the evidence reference

## Guardrails

- Require exactly one of `name` and `id`; reject empty objects and both fields together.
- Reject blank, padded, wildcard, array, and non-string names. IDs must be positive integers.
- Make only `GET` requests.
- Do not return custom fields, comments, serialized configuration, contacts, tokens, or arbitrary API response bodies.
- Map absent optional fields to `null`; do not infer them.
- Use a configurable request timeout (five seconds by default) and do not retry requests.
- Accept HTTP or HTTPS only; HTTP is permitted for local labs, while production deployment policy must require HTTPS. Embedded URL credentials are rejected.
- Map authentication, authorization, not-found, rate-limit, service, malformed-JSON, timeout, and network errors to concise, non-secret-bearing errors.

## Open implementation decisions

- Choose the MCP transport after confirming the first target client and deployment model; it is not part of the adapter.
- Confirm NetBox version and v2 token support in the lab environment.
- Define production timeout, TLS, and audit-log requirements with the target environment owner. Retry behavior remains unimplemented until documented.
