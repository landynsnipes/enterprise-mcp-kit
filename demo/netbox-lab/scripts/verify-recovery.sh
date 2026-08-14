#!/usr/bin/env bash
set -euo pipefail

# Non-destructive recovery drill: backs up the running lab database, restores it
# into an isolated disposable PostgreSQL container, and compares only counts.
root="$(cd "$(dirname "$0")/.." && pwd)"
compose=(docker compose --project-name enterprise-mcp-kit-demo --env-file "$root/.env" -f "$root/compose.yaml")
[[ -f "$root/.env" ]] || { echo 'Missing local lab environment.' >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$root/.env"
set +a

workdir="$(mktemp -d)"
suffix="$(date +%s)-$$"
restore_name="enterprise-mcp-kit-restore-$suffix"
restore_password="$(openssl rand -hex 24)"
cleanup() { docker rm -f "$restore_name" >/dev/null 2>&1 || true; rm -rf "$workdir"; }
trap cleanup EXIT

source_db="$(${compose[@]} ps -q postgres)"
[[ -n "$source_db" ]] || { echo 'PostgreSQL lab service is not running.' >&2; exit 1; }

# These counts are metadata only; no inventory names, addresses, or secrets are emitted.
source_counts="$(docker exec "$source_db" psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select (select count(*) from dcim_site), (select count(*) from dcim_device), (select count(*) from dcim_rack);')"
"${compose[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$workdir/netbox.dump"
[[ -s "$workdir/netbox.dump" ]] || { echo 'Database backup is empty.' >&2; exit 1; }
dump_sha256="$(sha256sum "$workdir/netbox.dump" | cut -d' ' -f1)"

postgres_image='docker.io/postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
docker run -d --rm --name "$restore_name" -e POSTGRES_DB=netbox_restore -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$restore_password" "$postgres_image" >/dev/null
for _ in $(seq 1 30); do docker exec "$restore_name" pg_isready -q -U restore -d netbox_restore && break; sleep 1; done
docker exec "$restore_name" pg_isready -q -U restore -d netbox_restore
docker exec -i "$restore_name" pg_restore -U restore -d netbox_restore --no-owner --no-privileges < "$workdir/netbox.dump"
restore_counts="$(docker exec "$restore_name" psql -At -U restore -d netbox_restore -c 'select (select count(*) from dcim_site), (select count(*) from dcim_device), (select count(*) from dcim_rack);')"
[[ "$source_counts" == "$restore_counts" ]] || { echo 'Restored database counts do not match the source.' >&2; exit 1; }

# The primary lab is untouched; prove its bounded read-only path still works.
bash "$root/scripts/verify-live.sh" >/dev/null
printf '{"result":"passed","recovery":"isolated-postgres-restore","sourceAndRestoreCounts":"%s","dumpSha256":"%s","primaryLab":"unchanged"}\n' "$source_counts" "$dump_sha256"
