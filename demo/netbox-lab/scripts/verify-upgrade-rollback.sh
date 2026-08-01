#!/usr/bin/env bash
set -euo pipefail

# Isolated release gate. It uses a unique Compose project, disposable volumes,
# and port 18000; it never attaches to or mutates enterprise-mcp-kit-demo.
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
origin_override="$root/config/upgrade-origin.compose.yaml"
target_override="$root/config/upgrade-target.compose.yaml"
project="enterprise-mcp-kit-upgrade-$$"
workdir="$(mktemp -d)"
backup="$workdir/netbox.dump"
base=(docker compose --project-name "$project" --env-file "$root/.env" -f "$root/compose.yaml")
origin=("${base[@]}" -f "$origin_override")
target=("${base[@]}" -f "$target_override")

[[ -f "$root/.env" ]] || { echo 'Missing local lab environment. Run npm run demo:env first.' >&2; exit 1; }
for file in "$origin_override" "$target_override"; do
  [[ -f "$file" ]] || { echo "Missing release-gate override: $file" >&2; exit 1; }
done
if command -v ss >/dev/null && ss -ltn | grep -qE '127\.0\.0\.1:18000[[:space:]]'; then
  echo 'Port 18000 is already in use; refusing to interfere with another process.' >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$root/.env"
set +a

cleanup() {
  "${origin[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

wait_healthy() {
  local label="$1"
  shift
  local -a command=("$@")
  local container status
  for _ in $(seq 1 60); do
    container="$("${command[@]}" ps -q netbox 2>/dev/null || true)"
    if [[ -n "$container" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
      [[ "$status" == healthy ]] && return 0
    fi
    sleep 5
  done
  echo "$label NetBox did not become healthy within five minutes." >&2
  return 1
}

seed_and_get_token() {
  local -a command=("$@")
  local container output token
  container="$("${command[@]}" ps -q netbox)"
  output="$(docker exec -i "$container" /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py shell < "$root/scripts/seed.py" 2>/dev/null)"
  token="$(printf '%s\n' "$output" | sed -n 's/^PHASE_B_TOKEN=//p' | tail -n 1)"
  [[ "$token" =~ ^nbt_[[:alnum:]]{12}\.[A-Za-z0-9_-]{40}$ ]] || {
    echo 'NetBox did not return the expected disposable API token.' >&2
    return 1
  }
  docker exec -i "$container" /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py shell < "$root/scripts/seed_showcase.py" >/dev/null 2>&1
  printf '%s' "$token"
}

verify_five_tools() {
  local token="$1"
  NETBOX_BASE_URL=http://127.0.0.1:18000 \
    NETBOX_TOKEN="$token" \
    NETBOX_TIMEOUT_MS=5000 \
    node "$root/scripts/verify-showcase.mjs" >/dev/null
}

npm run build --prefix "$repo" >/dev/null

"${origin[@]}" config -q
"${origin[@]}" up -d postgres redis redis-cache netbox netbox-worker >/dev/null 2>&1
wait_healthy origin "${origin[@]}"
token="$(seed_and_get_token "${origin[@]}")"
verify_five_tools "$token"

postgres="$("${origin[@]}" ps -q postgres)"
docker exec "$postgres" pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$backup"
[[ -s "$backup" ]] || { echo 'Disposable upgrade backup is empty.' >&2; exit 1; }

"${target[@]}" up -d --force-recreate netbox netbox-worker >/dev/null 2>&1
wait_healthy target "${target[@]}"
verify_five_tools "$token"

"${target[@]}" stop netbox-worker netbox >/dev/null 2>&1
docker exec -i "$postgres" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges < "$backup"
"${origin[@]}" up -d --force-recreate netbox netbox-worker >/dev/null 2>&1
wait_healthy rollback "${origin[@]}"
verify_five_tools "$token"

printf '%s\n' '{"result":"passed","isolation":"disposable-compose-project-and-volumes","origin":"NetBox 4.6.4 / NetBox Docker 5.0.1","target":"NetBox 4.6.5 / NetBox Docker 5.0.2","checks":["origin-five-read-only-tools","target-five-read-only-tools","database-restore","image-rollback","rollback-five-read-only-tools"],"runtimeStateClaimed":false}'
