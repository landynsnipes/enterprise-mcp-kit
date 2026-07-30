#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
compose=(docker compose --project-name enterprise-mcp-kit-demo --env-file "$root/.env" -f "$root/compose.yaml")
runtime="$root/.mcp.env"

[[ -f "$root/.env" ]] || {
  echo "Missing local lab environment. Run npm run demo:env first." >&2
  exit 1
}

"${compose[@]}" ps --status running netbox >/dev/null
container="$("${compose[@]}" ps -q netbox)"
[[ -n "$container" ]] || {
  echo "NetBox is not running. Run npm run demo:up first." >&2
  exit 1
}

output="$(
  docker exec -i "$container" \
    /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py shell \
    < "$root/scripts/seed.py" 2>/dev/null
)"
token="$(printf '%s\n' "$output" | sed -n 's/^PHASE_B_TOKEN=//p' | tail -n 1)"
device_id="$(printf '%s\n' "$output" | sed -n 's/^PHASE_B_DEVICE_ID=//p' | tail -n 1)"

[[ "$token" =~ ^nbt_[[:alnum:]]{12}\.[A-Za-z0-9_-]{40}$ ]] || {
  echo "NetBox did not return the expected local API token." >&2
  exit 1
}
[[ "$device_id" =~ ^[1-9][0-9]*$ ]] || {
  echo "NetBox did not return the expected demo device ID." >&2
  exit 1
}

umask 077
{
  printf 'NETBOX_BASE_URL=http://127.0.0.1:8000\n'
  printf 'NETBOX_TOKEN=%s\n' "$token"
  printf 'NETBOX_TIMEOUT_MS=5000\n'
  printf 'NETBOX_DEMO_DEVICE=edge-phx-01\n'
  printf 'NETBOX_DEMO_DEVICE_ID=%s\n' "$device_id"
} > "$runtime"
chmod 600 "$runtime"

echo "Seeded sanitized NetBox inventory and created a local read-only MCP credential."
echo "Runtime configuration written to ignored demo/netbox-lab/.mcp.env."
