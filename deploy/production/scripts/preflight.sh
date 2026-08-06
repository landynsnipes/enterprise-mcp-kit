#!/usr/bin/env bash
set -euo pipefail

deployment_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${1:?Usage: preflight.sh /secure/path/enterprise-mcp-kit.env}"

[[ -f "$env_file" ]] || { echo "Environment file does not exist." >&2; exit 1; }
[[ "$(stat -c '%a' "$env_file")" =~ ^[67][0-7][0-7]$ ]] || { echo "Environment file must not be group/world readable." >&2; exit 1; }
grep -Eq '(^|=)replace-' "$env_file" && { echo "Environment file still contains a placeholder." >&2; exit 1; }
grep -Eq '^GOVERNANCE_EXECUTION_ENABLED=true$' "$env_file" && echo "Write execution is enabled: confirm the approval record and scoped NetBox token before continuing." >&2
docker compose --env-file "$env_file" -f "$deployment_dir/compose.yaml" config -q
echo "Production Compose configuration is valid."
