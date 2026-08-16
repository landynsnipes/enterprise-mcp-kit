#!/usr/bin/env bash
set -euo pipefail

deployment_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${1:?Usage: acceptance.sh /secure/path/enterprise-mcp-kit.env}"

"$deployment_dir/scripts/preflight.sh" "$env_file"

read_env() {
  local key="$1"
  sed -n "s/^${key}=//p" "$env_file" | tail -n 1
}

netbox_host="$(read_env NETBOX_PUBLIC_HOST)"
mcp_host="$(read_env MCP_PUBLIC_HOST)"
host_pattern='^[A-Za-z0-9.-]+$'
[[ "$netbox_host" =~ $host_pattern && "$mcp_host" =~ $host_pattern ]] || {
  echo 'Public hostnames must contain only DNS hostname characters.' >&2
  exit 1
}

netbox_code="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 --output /dev/null --write-out '%{http_code}' "https://${netbox_host}/login/")"
[[ "$netbox_code" == 200 ]] || { echo "NetBox HTTPS login check returned ${netbox_code}." >&2; exit 1; }

mcp_code="$(curl --silent --show-error --connect-timeout 10 --max-time 20 --output /dev/null --write-out '%{http_code}' "https://${mcp_host}/mcp")"
[[ "$mcp_code" == 401 ]] || { echo "Unauthenticated MCP check returned ${mcp_code}; expected 401." >&2; exit 1; }

docker compose --env-file "$env_file" -f "$deployment_dir/compose.yaml" ps --status running --format json >/dev/null
echo 'Acceptance ingress checks passed: NetBox HTTPS is reachable and the MCP gateway rejects unauthenticated access.'
