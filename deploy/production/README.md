# Private Docker Compose production reference

This is the supported self-hosted reference for a private Linux host. It runs
NetBox Community, its worker and backing services, the authenticated governance
MCP gateway, a dedicated audit database, and Caddy TLS ingress.

It is not the demo lab. The local lab uses generated credentials, Keycloak
development mode, loopback ports, and sanitized seed data; none of those are
used here.

Follow [the production installation guide](../../docs/install-production-compose.md)
before starting this stack.

The only public ports are 80 and 443 on Caddy. NetBox, both databases, Valkey,
and the gateway have no host port mappings. The gateway's `/healthz` and
`/metrics` routes are intentionally not exposed through Caddy.
