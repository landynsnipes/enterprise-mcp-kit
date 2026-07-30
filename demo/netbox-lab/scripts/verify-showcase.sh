#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
runtime="$root/.mcp.env"
compose=(docker compose --project-name enterprise-mcp-kit-demo --env-file "$root/.env" -f "$root/compose.yaml")

[[ -f "$runtime" ]] || {
  echo "Missing local MCP configuration. Run npm run demo:seed first." >&2
  exit 1
}

container="$("${compose[@]}" ps -q netbox)"
[[ -n "$container" ]] || {
  echo "NetBox is not running." >&2
  exit 1
}

output="$(
  docker exec -i "$container" \
    /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py shell \
    < "$root/scripts/verify_showcase.py" 2>/dev/null
)"
summary="$(printf '%s\n' "$output" | sed -n 's/^SHOWCASE_VERIFY=//p' | tail -n 1)"
[[ -n "$summary" ]] || {
  echo "Showcase structure verification failed." >&2
  exit 1
}
printf '%s\n' "$summary"

set -a
source "$runtime"
set +a
npm run build --prefix "$repo"
node "$root/scripts/verify-showcase.mjs"
