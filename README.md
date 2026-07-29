# Enterprise MCP Kit

A reusable foundation for secure, job-oriented enterprise MCP connectors.

## First reference integration: NetBox device lookup

The first tool answers one bounded question: **what does NetBox know about this device?** It will retrieve a small, explainable inventory summary by device name or ID. It will not create, update, delete, or expose a generic NetBox API surface.

```text
AI client -> get_device_context -> NetBox REST API (read-only) -> evidence-bounded device summary
```

## Implemented adapter contract

- Input: exactly one device `name` or numeric `id`.
- Output: device identity, status, site, role, device type, primary IP, and source record reference.
- Boundaries: no writes, no bulk enumeration, no arbitrary filters, and no secret values in tool output.
- Authentication: a least-privilege NetBox API token supplied only at runtime in the adapter options.
- Transport: GET only, with a configurable base URL and a five-second default timeout.
- Base URL: HTTP and HTTPS are accepted for local labs; production deployment policy must require HTTPS. Embedded URL credentials are rejected.
- Name lookup: queries the NetBox device endpoint, then accepts exactly one exact-name result.
- Errors: validation and HTTP failures are stable and never include tokens or raw response bodies.

## Repository layout

```text
docs/
  netbox-device-lookup.md
src/
  netbox-client.ts
test/
  netbox-client.test.ts
```

## Status

The NetBox adapter and mocked tests are implemented. MCP transport, live NetBox compatibility, and deployment guidance remain deliberately separate and pending a demo or lab environment.

## Local commands

```sh
npm install
npm run build
npm run typecheck
npm test
npm run validate
```

## References

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
- [NetBox REST API documentation](https://netbox.readthedocs.io/en/stable/integrations/rest-api/)

## License

Licensed under the [Apache License 2.0](LICENSE).
