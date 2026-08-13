#!/usr/bin/env bash
set -euo pipefail

: "${CI_PIPELINE_ID:?CI_PIPELINE_ID is required}"
: "${CI_COMMIT_SHA:?CI_COMMIT_SHA is required}"

las_namespace=cloud-reference
chi_namespace=cloud-reference-chi
deployment=cloud-reference
decision_trace_id="gitlab-pipeline-${CI_PIPELINE_ID}-f2-site-service-loss"
evidence_dir=delivery-evidence/degraded-operation
evidence_path="${evidence_dir}/site-service-loss.json"
checksum_path="${evidence_path}.sha256"
original_replicas="$(kubectl -n "$las_namespace" get deployment "$deployment" -o jsonpath='{.spec.replicas}')"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restored=false

restore_las() {
  kubectl -n "$las_namespace" scale deployment "$deployment" --replicas="$original_replicas" >/dev/null
  kubectl -n "$las_namespace" rollout status deployment "$deployment" --timeout=120s >/dev/null
  restored=true
}

finish() {
  local exit_code=$?
  if [[ "$restored" != true ]]; then
    restore_las || exit_code=1
  fi
  exit "$exit_code"
}
trap finish EXIT

[[ "$original_replicas" =~ ^[1-9][0-9]*$ ]]
kubectl -n "$chi_namespace" rollout status deployment "$deployment" --timeout=120s >/dev/null

kubectl -n "$las_namespace" scale deployment "$deployment" --replicas=0 >/dev/null
for _ in $(seq 1 30); do
  las_ready="$(kubectl -n "$las_namespace" get deployment "$deployment" -o jsonpath='{.status.readyReplicas}')"
  [[ -z "$las_ready" || "$las_ready" == 0 ]] && break
  sleep 2
done
las_ready="$(kubectl -n "$las_namespace" get deployment "$deployment" -o jsonpath='{.status.readyReplicas}')"
[[ -z "$las_ready" || "$las_ready" == 0 ]]

chi_ready="$(kubectl -n "$chi_namespace" get deployment "$deployment" -o jsonpath='{.status.readyReplicas}')"
chi_desired="$(kubectl -n "$chi_namespace" get deployment "$deployment" -o jsonpath='{.spec.replicas}')"
[[ "$chi_ready" == "$chi_desired" && "$chi_desired" -gt 0 ]]

degraded_verified_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restore_las
las_recovered="$(kubectl -n "$las_namespace" get deployment "$deployment" -o jsonpath='{.status.readyReplicas}')"
[[ "$las_recovered" == "$original_replicas" ]]
recovered_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$evidence_dir"
CI_PIPELINE_ID="$CI_PIPELINE_ID" CI_COMMIT_SHA="$CI_COMMIT_SHA" \
DECISION_TRACE_ID="$decision_trace_id" STARTED_AT="$started_at" \
DEGRADED_VERIFIED_AT="$degraded_verified_at" RECOVERED_AT="$recovered_at" \
ORIGINAL_REPLICAS="$original_replicas" CHI_READY="$chi_ready" \
node --input-type=module -e '
  import { writeFileSync } from "node:fs";
  const evidence = {
    schemaVersion: 1,
    scenario: "F2-site-service-loss",
    result: "passed",
    pipelineId: process.env.CI_PIPELINE_ID,
    commitSha: process.env.CI_COMMIT_SHA,
    decisionTraceId: process.env.DECISION_TRACE_ID,
    startedAt: process.env.STARTED_AT,
    degradedVerifiedAt: process.env.DEGRADED_VERIFIED_AT,
    recoveredAt: process.env.RECOVERED_AT,
    las: { injectedReplicas: 0, restoredReplicas: Number(process.env.ORIGINAL_REPLICAS) },
    chi: { readyReplicasDuringLasLoss: Number(process.env.CHI_READY) },
    claimsBoundary: "Logical site-service recovery on one shared WSL host; not physical-site HA or disaster recovery.",
    autonomousRemediation: false
  };
  writeFileSync("delivery-evidence/degraded-operation/site-service-loss.json", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
'
sha256sum "$evidence_path" > "$checksum_path"
cat "$evidence_path"
cat "$checksum_path"
