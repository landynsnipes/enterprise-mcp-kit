#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
runtime="$root/.mcp.env"

[[ -f "$runtime" ]] || {
  echo "Missing local MCP configuration. Run npm run demo:seed first." >&2
  exit 1
}
[[ "$(stat -c '%a' "$runtime")" == "600" ]] || {
  echo "Local MCP configuration must have mode 600." >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
source "$runtime"
set +a

npm run build --prefix "$repo"
node "$root/scripts/verify-live.mjs"

container="$(
  docker compose --project-name enterprise-mcp-kit-demo \
    --env-file "$root/.env" -f "$root/compose.yaml" ps -q netbox
)"
write_enabled="$(
  docker exec "$container" /opt/netbox/venv/bin/python \
    /opt/netbox/netbox/manage.py shell -c \
    "from users.models import Token; print(Token.objects.get(description='Enterprise MCP Kit disposable lab').write_enabled)" \
    2>/dev/null | tail -n 1
)"
[[ "$write_enabled" == "False" ]] || {
  echo "The demo API token is unexpectedly write-enabled." >&2
  exit 1
}
echo "Verified the NetBox token is write-disabled."
