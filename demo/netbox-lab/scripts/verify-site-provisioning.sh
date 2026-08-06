#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
runtime="$root/.governance-provision.env"

[[ -f "$runtime" ]] || {
  echo "Missing provisioning configuration. Run npm run demo:seed first." >&2
  exit 1
}

set -a
source "$runtime"
set +a
cd "$repo"
npm run build >/dev/null
node demo/netbox-lab/scripts/verify-site-provisioning.mjs
