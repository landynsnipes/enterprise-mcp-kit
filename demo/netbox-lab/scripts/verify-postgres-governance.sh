#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)";repo="$(cd "$root/../.." && pwd)";compose=(docker compose --project-name enterprise-mcp-kit-demo --env-file "$root/.env" -f "$root/compose.yaml");container="$("${compose[@]}" ps -q postgres)";database='enterprise_mcp_governance_test';workdir="$(mktemp -d)";restore_name="enterprise-mcp-governance-restore-$(date +%s)-$$";restore_password="$(openssl rand -hex 24)"
[[ -n "$container" ]]||{ echo 'PostgreSQL lab container is not running.' >&2;exit 1; }
set -a;source "$root/.env";set +a
reset_source(){ docker exec "$container" dropdb --if-exists --force -U "$POSTGRES_USER" "$database" >/dev/null 2>&1||true; }
cleanup(){ docker rm -f "$restore_name" >/dev/null 2>&1||true;reset_source;rm -rf "$workdir"; };trap cleanup EXIT
reset_source;docker exec "$container" createdb -U "$POSTGRES_USER" "$database"
address="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container")"
url="$(PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$database" PGHOST="$address" node -e 'process.stdout.write(`postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:5432/${encodeURIComponent(process.env.PGDATABASE)}`)')"
cd "$repo";npm run build >/dev/null;GOVERNANCE_DATABASE_URL="$url" node demo/netbox-lab/scripts/verify-postgres-governance.mjs
source_counts="$(docker exec "$container" psql -At -U "$POSTGRES_USER" -d "$database" -c 'select (select count(*) from enterprise_mcp_governance_state), (select count(*) from enterprise_mcp_governance_audit), (select count(*) from jsonb_array_elements((select plans from enterprise_mcp_governance_state where singleton=true)));')"
docker exec "$container" pg_dump -U "$POSTGRES_USER" -Fc "$database" >"$workdir/governance.dump"
test -s "$workdir/governance.dump"
dump_sha256="$(sha256sum "$workdir/governance.dump"|cut -d' ' -f1)"
postgres_image='docker.io/postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
docker run -d --rm --name "$restore_name" -e POSTGRES_DB=governance_restore -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$restore_password" "$postgres_image" >/dev/null
for _ in $(seq 1 30);do docker exec "$restore_name" pg_isready -q -U restore -d governance_restore&&break;sleep 1;done
docker exec "$restore_name" pg_isready -q -U restore -d governance_restore
docker exec -i "$restore_name" pg_restore -U restore -d governance_restore --no-owner --no-privileges <"$workdir/governance.dump"
restore_counts="$(docker exec "$restore_name" psql -At -U restore -d governance_restore -c 'select (select count(*) from enterprise_mcp_governance_state), (select count(*) from enterprise_mcp_governance_audit), (select count(*) from jsonb_array_elements((select plans from enterprise_mcp_governance_state where singleton=true)));')"
test "$source_counts" = "$restore_counts"
printf '{"result":"passed","recovery":"governance-postgres-isolated-restore","stateAuditPlanCounts":"%s","dumpSha256":"%s","sourceDatabaseRemovedOnExit":true}\n' "$restore_counts" "$dump_sha256"
