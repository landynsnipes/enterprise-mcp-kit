#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; env_file="$root/.env"
[[ -f "$env_file" ]] || { echo 'Missing local lab environment. Run npm run demo:env first.' >&2; exit 1; }
grep -q '^KEYCLOAK_ADMIN=' "$env_file" && grep -q '^KEYCLOAK_ADMIN_PASSWORD=' "$env_file" && exit 0
command -v openssl >/dev/null || { echo 'openssl is required to generate local identity credentials.' >&2; exit 1; }
umask 077
{ grep -q '^KEYCLOAK_ADMIN=' "$env_file" || printf 'KEYCLOAK_ADMIN=demo-admin\n'; grep -q '^KEYCLOAK_ADMIN_PASSWORD=' "$env_file" || printf 'KEYCLOAK_ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 36 | tr -d '\n' | tr '/+' 'ab')"; } >> "$env_file"
chmod 600 "$env_file"
echo 'Added missing local Keycloak bootstrap credentials to demo/netbox-lab/.env.'
