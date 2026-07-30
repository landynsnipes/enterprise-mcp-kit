# Connect an existing NetBox deployment

Use this path when your organization already operates NetBox and only needs the
MCP integration.

## What this adds

The MCP server exposes one bounded, read-only job:
`get_device_context`. It retrieves an approved subset of device inventory by
exact device name or numeric ID.

It does not install, replace, migrate, or administer NetBox. It does not expose
arbitrary NetBox endpoints, bulk inventory enumeration, or write actions.

## Requirements

- Node.js 18 or later
- Network access from the MCP server to the NetBox REST API
- A dedicated, least-privilege NetBox API token
- HTTPS and trusted certificate validation for production deployments

## Configure the server

Install and build the project:

```sh
npm ci
npm run validate
```

Provide configuration only at runtime:

```sh
export NETBOX_BASE_URL="https://netbox.example.com"
export NETBOX_TOKEN="<read-only-token>"
export NETBOX_TIMEOUT_MS="5000"
npm run mcp:stdio
```

`NETBOX_TIMEOUT_MS` is optional. Never commit the token, a production URL, or
real infrastructure inventory to this repository.

## Before production use

- Confirm API compatibility with your deployed NetBox version.
- Scope the token to the minimum permissions required for device lookup.
- Keep the MCP process and secrets within your organization’s trusted runtime.
- Configure identity, audit logging, egress controls, TLS, monitoring, and
  secret rotation according to organizational policy.
- Test error handling and timeout behavior against a non-production NetBox
  environment.

See the precise tool boundary in
[NetBox device lookup](netbox-device-lookup.md).
