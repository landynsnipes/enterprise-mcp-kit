# Connect the Grafana MCP to an existing Grafana

Choose this path when Grafana is already your organization’s operator view.
It installs only the MCP integration. It does not install, replace, or administer Grafana.

## What users can do

| Tool | Input | Use it for |
| --- | --- | --- |
| `get_dashboard_context` | `{ "uid": "k8s-prod" }` | One dashboard’s title, folder, tags, and version |
| `get_alert_rule_context` | `{ "uid": "cpu-high" }` | One provisioned alert rule, including paused state |
| `set_alert_rule_paused` | `{ "uid": "cpu-high", "expectedPaused": false, "paused": true }` | Pause or unpause that exact rule after verifying prior state |

Writes are off until `GRAFANA_ENABLE_WRITES=true`. The tool never lists folders, never queries arbitrary datasources, and never creates dashboards.

## Requirements

- Node.js 18 or later on the host that runs the MCP process
- Network access to the Grafana HTTP API
- A dedicated Grafana service account token. Use a Viewer token for read-only; alerting write permission is required to pause rules
- HTTPS in production

## Install and configure

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run validate
```

```sh
export GRAFANA_BASE_URL="https://grafana.example.com"
export GRAFANA_TOKEN="<service-account-token>"
export GRAFANA_TIMEOUT_MS="5000"
# optional writes:
export GRAFANA_ENABLE_WRITES="true"
npm run mcp:grafana
```

## Connect an AI client

```json
{
  "mcpServers": {
    "grafana-context": {
      "command": "node",
      "args": ["/opt/enterprise-mcp-kit/dist/src/grafana-server.js"],
      "env": {
        "GRAFANA_BASE_URL": "https://grafana.example.com",
        "GRAFANA_TOKEN": "${GRAFANA_TOKEN}",
        "GRAFANA_ENABLE_WRITES": "false"
      }
    }
  }
}
```

## How to use it

- “Show Grafana dashboard `k8s-prod`.”
- “Is alert rule `cpu-high` paused?”
- “Pause `cpu-high` only if it is currently firing/unpaused.”

## Validate before production use

1. Confirm a Viewer token cannot pause a rule.
2. Call both read tools against known UIDs, plus a missing-UID error.
3. If writes are enabled, pause then restore one non-production rule using `expectedPaused`.
4. Record the repository release and Grafana version.
