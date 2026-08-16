#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; repo="$(cd "$root/../.." && pwd)"; target="$root/.env"; rotate="${1:-}"
[[ ! -e "$target" || "$rotate" == '--rotate' ]] || { echo 'Cloud-event .env already exists; preserving it.'; exit 0; }
umask 077; temporary="$(mktemp "$root/.env.tmp.XXXXXX")"; trap 'rm -f "$temporary"' EXIT
node "$repo/scripts/generate-cloud-event-secrets.mjs" > "$temporary"
printf '%s\n' 'CLOUD_EVENT_OIDC_ISSUER=http://127.0.0.1:8081/realms/enterprise-mcp-kit' 'CLOUD_EVENT_OIDC_JWKS_URL=http://keycloak:8080/realms/enterprise-mcp-kit/protocol/openid-connect/certs' 'CLOUD_EVENT_OIDC_AUDIENCE=enterprise-mcp-kit' 'CLOUD_EVENT_INSECURE_JWKS_HOSTS=keycloak' >> "$temporary"
mv "$temporary" "$target"; trap - EXIT; chmod 600 "$target"; echo 'Generated separate bcrypt-backed API and worker NATS credentials.'
