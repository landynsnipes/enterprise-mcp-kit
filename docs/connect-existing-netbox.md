# Connect the NetBox MCP to an existing NetBox deployment

Choose this path when NetBox is already your organization’s system of record.
It installs only the read-only MCP integration; it does not install, replace,
migrate, or administer NetBox.

## What users can do

The local stdio MCP exposes these five exact, read-only tools. Each accepts
only the identifiers shown below. None creates, changes, deletes, broadly
enumerates, or proxies arbitrary NetBox API requests.

| Tool | Input | Use it for |
| --- | --- | --- |
| `get_device_context` | `{ "name": "edge-phx-01" }` or `{ "id": 42 }` | One device’s inventory and recorded software posture |
| `get_site_overview` | `{ "name": "Phoenix Lab" }` or `{ "id": 7 }` | One site’s bounded inventory, rack, circuit, contact, and software summary |
| `get_connectivity_path` | `{ "fromSite": "Phoenix Lab", "toSite": "Reno Lab" }` | Direct circuit and VPN inventory evidence between two exact sites |
| `get_rack_context` | `{ "site": "Phoenix Lab", "name": "PHX-A01" }` or `{ "id": 9 }` | One rack’s recorded elevation, equipment, and feed count |
| `get_power_path` | `{ "name": "edge-phx-01" }` or `{ "id": 42 }` | Recorded device ports, cabled PDU outlets, and rack-feed evidence |

Connectivity answers describe recorded direct evidence, not a live routed or
forwarding path. Power answers never claim live load, breaker state, or actual
power delivery. A `truncated` result means the bounded response omitted further
inventory evidence.

## Requirements

- Node.js 18 or later on the system that runs the AI client’s MCP process
- Network access from that process to the NetBox REST API
- A dedicated, write-disabled NetBox API token with only the view permissions
  required by the five tools
- HTTPS with trusted certificate validation in production

The exact NetBox model families required for each tool are listed in
[Production-reference operations](production-reference-operations.md#netbox-least-privilege-roles).
Start with a non-production NetBox instance and treat a 403 response as a
permission-design issue, not a reason to grant broad access.

## Install and configure

On the host that will run the MCP process, obtain a reviewed release and build
it once:

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run validate
```

Store the token in your approved secret mechanism. For a shell-managed local
test, supply it only at process start:

```sh
export NETBOX_BASE_URL="https://netbox.example.com"
export NETBOX_TOKEN="<read-only-token-from-your-secret-store>"
export NETBOX_TIMEOUT_MS="5000"
npm run mcp:stdio
```

`NETBOX_TIMEOUT_MS` is optional and defaults to 5000. Never commit a token,
production URL, or live inventory export. Embedded URL credentials are refused.

## Connect an AI client

Configure the client’s local MCP settings with the command and environment
below. The exact file location and UI differ by client; the connection contract
is the same standard-input/standard-output process.

```json
{
  "mcpServers": {
    "netbox-context": {
      "command": "node",
      "args": ["/opt/enterprise-mcp-kit/dist/src/server.js"],
      "env": {
        "NETBOX_BASE_URL": "https://netbox.example.com",
        "NETBOX_TOKEN": "${NETBOX_READ_TOKEN}",
        "NETBOX_TIMEOUT_MS": "5000"
      }
    }
  }
}
```

Use your client’s supported secret reference instead of literally storing
`NETBOX_READ_TOKEN` in its configuration. If it cannot inject environment
variables securely, run the process under a managed service or secret-aware
wrapper rather than placing the token in a settings file.

## How to use it

Ask focused questions that map to one of the exact inputs. For example:

- “Show the NetBox context for `edge-phx-01`.”
- “Give me the recorded overview for the `Phoenix Lab` site.”
- “What direct circuit or VPN evidence connects `Phoenix Lab` to `Reno Lab`?”
- “Show the recorded equipment and feeds in rack `PHX-A01` at `Phoenix Lab`.”
- “What does NetBox record as the power path for `edge-phx-01`?”

Review the structured result’s `source`, `unknowns`, and `truncated` fields
before acting on it. This MCP provides evidence from NetBox; it is not an
automation channel and cannot make changes.

## Validate before production use

1. Confirm the token cannot perform a NetBox write.
2. Call each of the five tools against approved test records, including a
   missing-record error and a permission-denied case.
3. Confirm timeout, logging, egress, secret rotation, monitoring, and client
   access follow your organization’s policy.
4. Record the deployed repository release and NetBox compatibility result.

If you need governed writes or a clean NetBox installation, use the separate
[full self-hosted production reference](install-production-compose.md). Its
authenticated gateway is not a replacement for this public read-only MCP path.
