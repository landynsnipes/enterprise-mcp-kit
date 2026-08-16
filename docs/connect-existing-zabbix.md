# Connect the Zabbix MCP to an existing Zabbix

Choose this path when Zabbix is already your organization’s availability
monitor. It installs only the MCP integration. It does not install or replace Zabbix.

## What users can do

| Tool | Input | Use it for |
| --- | --- | --- |
| `get_host_context` | `{ "host": "edge-phx-01" }` | One host’s identity, enabled status, and recorded OS inventory |
| `get_problem_context` | `{ "eventId": 77 }` | One problem’s name, severity, acknowledgement, and host |
| `acknowledge_problem` | `{ "eventId": 77, "message": "On-call acknowledged.", "expectedAcknowledged": false }` | Acknowledge that exact unacknowledged problem |

Writes are off until `ZABBIX_ENABLE_WRITES=true`. The tool never lists all hosts,
never closes events, never changes triggers, and never proxies arbitrary JSON-RPC.

## Requirements

- Node.js 18 or later
- Network access to `https://zabbix.example.com/api_jsonrpc.php`
- A Zabbix API token (Zabbix 6.4+ / 7.x). Use a read-only role for reads; problem update permission for acknowledge
- HTTPS in production

## Install and configure

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run validate
```

```sh
export ZABBIX_BASE_URL="https://zabbix.example.com"
export ZABBIX_TOKEN="<api-token>"
export ZABBIX_TIMEOUT_MS="5000"
export ZABBIX_ENABLE_WRITES="true"
enterprise-mcp-zabbix
```

`ZABBIX_BASE_URL` is the Zabbix web root, not the UI path. The client posts to `api_jsonrpc.php`. After `npm ci && npm run build`, `enterprise-mcp-zabbix` is on `node_modules/.bin`. `npm run mcp:zabbix` is equivalent.

## Connect an AI client

```json
{
  "mcpServers": {
    "zabbix-context": {
      "command": "enterprise-mcp-zabbix",
      "env": {
        "ZABBIX_BASE_URL": "https://zabbix.example.com",
        "ZABBIX_TOKEN": "${ZABBIX_TOKEN}",
        "ZABBIX_ENABLE_WRITES": "false"
      }
    }
  }
}
```

## How to use it

- “What does Zabbix know about host `edge-phx-01`?”
- “Show problem event `77`.”
- “Acknowledge event `77` with message `On-call acknowledged` if it is not already acknowledged.”

## Validate before production use

1. Confirm a read-only token cannot acknowledge.
2. Call both read tools against known records, plus missing-host and missing-event cases.
3. If writes are enabled, acknowledge one test problem and confirm `expectedAcknowledged: false` rejects a second call.
4. Record the repository release and Zabbix version.
