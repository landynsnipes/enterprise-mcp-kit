#!/bin/sh
set -eu

test "$(id -u)" -eq 0 || { echo 'Run as WSL root.' >&2; exit 1; }
cd "$(dirname "$0")/../.."

duration_seconds="${AIOPS_PARTITION_DURATION_SECONDS:-600}"
case "$duration_seconds" in *[!0-9]*|'') echo 'Duration must be an integer.' >&2; exit 2;; esac
test "$duration_seconds" -ge 600 || { echo 'AT-12 requires at least 600 seconds.' >&2; exit 2; }

trace_id=dtr_wireguard_at12_v1
evidence_dir=delivery-evidence/wireguard
evidence_path="$evidence_dir/at12-degraded-window.json"
checksum_path="$evidence_path.sha256"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_epoch="$(date +%s)"
deadline=$((started_epoch + duration_seconds))
samples=0
recovered=false

recover() {
  sh demo/wireguard-netns/partition.sh up >/dev/null
  sleep 6
  sh demo/wireguard-netns/verify.sh >/dev/null
  recovered=true
}

finish() {
  exit_code=$?
  if [ "$recovered" != true ]; then
    recover || exit_code=1
  fi
  exit "$exit_code"
}
trap finish EXIT INT TERM

sh demo/wireguard-netns/verify.sh >/dev/null
curl -fsS http://127.0.0.1:9108/api/status | jq -e '.healthy == true' >/dev/null
sh demo/wireguard-netns/partition.sh down >/dev/null

while :; do
  if ip netns exec aiops-las-workload ping -c 1 -W 1 10.20.0.20 >/dev/null 2>&1; then
    echo 'Cross-site path remained reachable during partition.' >&2
    exit 1
  fi
  ip netns exec aiops-las-workload ping -c 1 -W 1 10.10.0.10 >/dev/null
  ip netns exec aiops-chi-workload ping -c 1 -W 1 10.20.0.10 >/dev/null
  curl -fsS http://127.0.0.1:9108/api/status | jq -e '.healthy == false and .allowedPathUp == false and .deniedPathBlocked == true' >/dev/null
  samples=$((samples + 1))
  now="$(date +%s)"
  test "$now" -ge "$deadline" && break
  sleep 30
done

degraded_verified_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
recover
curl -fsS http://127.0.0.1:9108/api/status | jq -e '.healthy == true and .allowedPathUp == true and .deniedPathBlocked == true' >/dev/null
recovered_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
elapsed_seconds=$(($(date +%s) - started_epoch))

mkdir -p "$evidence_dir"
TRACE_ID="$trace_id" STARTED_AT="$started_at" DEGRADED_VERIFIED_AT="$degraded_verified_at" \
RECOVERED_AT="$recovered_at" DURATION_SECONDS="$duration_seconds" ELAPSED_SECONDS="$elapsed_seconds" SAMPLES="$samples" \
node --input-type=module -e '
  import { writeFileSync } from "node:fs";
  const evidence = {
    schemaVersion: 1,
    acceptanceTest: "AT-12",
    scenario: "F3-loss-of-site-connectivity",
    result: "passed",
    decisionTraceId: process.env.TRACE_ID,
    startedAt: process.env.STARTED_AT,
    degradedVerifiedAt: process.env.DEGRADED_VERIFIED_AT,
    recoveredAt: process.env.RECOVERED_AT,
    requestedPartitionSeconds: Number(process.env.DURATION_SECONDS),
    observedElapsedSeconds: Number(process.env.ELAPSED_SECONDS),
    sampleCount: Number(process.env.SAMPLES),
    localOperation: { las: "reachable", chi: "reachable" },
    crossSitePath: "failed-closed",
    prohibitedEastWestPath: "blocked",
    telemetry: "continued",
    executedActionCount: 0,
    mutationSurfaceExposed: false,
    boundary: "Native WSL namespace topology on one shared physical host; not physical-site HA or disaster recovery."
  };
  writeFileSync("delivery-evidence/wireguard/at12-degraded-window.json", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
'
sha256sum "$evidence_path" > "$checksum_path"
cat "$evidence_path"
cat "$checksum_path"
