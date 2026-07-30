#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
compose=(docker compose --project-name enterprise-mcp-kit-demo --env-file "$root/.env" -f "$root/compose.yaml")

[[ -f "$root/.env" ]] || {
  echo "Missing local lab environment. Run npm run demo:env first." >&2
  exit 1
}

container="$("${compose[@]}" ps -q netbox)"
[[ -n "$container" ]] || {
  echo "NetBox is not running. Run npm run demo:up first." >&2
  exit 1
}

output="$(
  docker exec -i "$container" \
    /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py shell \
    < "$root/scripts/seed_showcase.py" 2>/dev/null
)"
printf '%s\n' "$output" | grep '^SHOWCASE_'
printf '%s\n' "$output" | grep -q '^SHOWCASE_SEED=complete$' || {
  echo "Showcase seed did not complete." >&2
  exit 1
}
