#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)";repo="$(cd "$root/../.." && pwd)";compose=(docker compose --project-name enterprise-mcp-kit-demo --env-file "$root/.env" -f "$root/compose.yaml");container="$("${compose[@]}" ps -q postgres)";database='enterprise_mcp_governance_test'
[[ -n "$container" ]]||{ echo 'PostgreSQL lab container is not running.' >&2;exit 1; }
set -a;source "$root/.env";set +a
cleanup(){ docker exec "$container" dropdb --if-exists --force -U "$POSTGRES_USER" "$database" >/dev/null 2>&1||true; };trap cleanup EXIT
cleanup;docker exec "$container" createdb -U "$POSTGRES_USER" "$database"
address="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container")"
url="$(PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$database" PGHOST="$address" node -e 'process.stdout.write(`postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:5432/${encodeURIComponent(process.env.PGDATABASE)}`)')"
cd "$repo";npm run build >/dev/null;GOVERNANCE_DATABASE_URL="$url" node demo/netbox-lab/scripts/verify-postgres-governance.mjs
