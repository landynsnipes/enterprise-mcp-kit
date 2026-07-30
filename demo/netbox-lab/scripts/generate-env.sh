#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; target="$root/.env"
[[ ! -e "$target" ]] || { echo '.env already exists; refusing to overwrite.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'openssl is required to generate local secrets.' >&2; exit 1; }
value(){ openssl rand -base64 36 | tr -d '\n' | tr '/+' 'ab'; }
secret_key(){ openssl rand -base64 72 | tr -d '\n' | tr '/+' 'ab'; }
key="$(secret_key)"
[[ ${#key} -ge 50 ]] || { echo 'Generated SECRET_KEY is too short.' >&2; exit 1; }
umask 077
cat > "$target" <<EOF
POSTGRES_DB=netbox
POSTGRES_USER=netbox
POSTGRES_PASSWORD=$(value)
REDIS_PASSWORD=$(value)
REDIS_CACHE_PASSWORD=$(value)
SECRET_KEY=$key
API_TOKEN_PEPPER_1=$(value)
SUPERUSER_NAME=demo-admin
SUPERUSER_EMAIL=demo-admin@example.test
SUPERUSER_PASSWORD=$(value)
KEYCLOAK_ADMIN=demo-admin
KEYCLOAK_ADMIN_PASSWORD=$(value)
EOF
chmod 600 "$target"; echo 'Created local demo/netbox-lab/.env with restrictive permissions.'
