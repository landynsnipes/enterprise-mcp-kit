# Connect the OPNsense MCP to an existing firewall

Choose this path when OPNsense is already your edge or site firewall.
It installs only the MCP integration. It does not replace OPNsense, dump the
full rule set, or expose a generic firewall API.

## What users can do

| Tool | Input | Use it for |
| --- | --- | --- |
| `get_interface_context` | `{ "identity": "wan" }` | One interface statistic record (status and IPv4 if present) |
| `get_alias_context` | `{ "uuid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }` | One firewall alias name, type, and enabled flag |
| `toggle_alias` | `{ "uuid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "expectedEnabled": true }` | Toggle that alias after verifying the expected enabled state |

Writes are off until `OPNSENSE_ENABLE_WRITES=true`. The tool never lists all
rules, never changes NAT, and never applies an unbound configuration.

## Requirements

- Node.js 18 or later
- Network access to the OPNsense API (`https://fw.example.com`)
- An OPNsense API key and secret. Use a least-privilege user: interface diagnostics plus alias read; alias write only if you enable writes
- HTTPS in production

Create the key under System → Access → Users → API keys.

## Install and configure

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run validate
```

```sh
export OPNSENSE_BASE_URL="https://fw.example.com"
export OPNSENSE_KEY="<api-key>"
export OPNSENSE_SECRET="<api-secret>"
export OPNSENSE_TIMEOUT_MS="5000"
export OPNSENSE_ENABLE_WRITES="false"
npm run mcp:opnsense
```

## Connect an AI client

```json
{
  "mcpServers": {
    "opnsense-context": {
      "command": "node",
      "args": ["/opt/enterprise-mcp-kit/dist/src/opnsense-server.js"],
      "env": {
        "OPNSENSE_BASE_URL": "https://fw.example.com",
        "OPNSENSE_KEY": "${OPNSENSE_KEY}",
        "OPNSENSE_SECRET": "${OPNSENSE_SECRET}",
        "OPNSENSE_ENABLE_WRITES": "false"
      }
    }
  }
}
```

## How to use it

- “What does OPNsense report for interface `wan`?”
- “Is alias UUID `…` enabled?”
- “Disable that alias only if it is currently enabled.”

## Validate before production use

1. Confirm a read-only key cannot toggle an alias.
2. Call both read tools against known records, plus a missing UUID.
3. If writes are enabled, toggle a non-production alias and restore it with `expectedEnabled`.
4. Record the repository release and OPNsense version.
