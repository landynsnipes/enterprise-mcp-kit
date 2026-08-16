#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo 'Run as WSL root.' >&2; exit 1; }
cd "$(dirname "$0")/../.."

namespace=cloud-reference
deployment=cloud-reference
samples_required=21
interval_seconds=15
minimum_window_seconds=300
cpu_limit_millicores=150
trace='gitlab-pipeline-7'
correlation_id="at09-las-$(date -u +%Y%m%dT%H%M%SZ)"
action_reference='gitlab-pipeline-7-las-rollback-restore'
evidence_dir=delivery-evidence/kubernetes
evidence_path="$evidence_dir/at09-post-action-window.json"
samples_path="$(mktemp)"
trap 'rm -f "$samples_path"' EXIT
kubectl=(k3s kubectl)

for sample_number in $(seq 1 "$samples_required"); do
  sampled_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  sampled_epoch="$(date +%s)"
  deployment_json="$("${kubectl[@]}" -n "$namespace" get deployment "$deployment" -o json 2>/dev/null || printf '{}')"
  pods_json="$("${kubectl[@]}" -n "$namespace" get pods -l app=cloud-reference -o json 2>/dev/null || printf '{"items":[]}')"
  observer_json="$(curl -fsS http://127.0.0.1:9109/api/status 2>/dev/null || printf '{"healthy":false,"pods":[]}')"
  alerts_json="$(curl -fsS http://127.0.0.1:9090/api/v1/alerts 2>/dev/null || printf '{"data":{"alerts":[]}}')"

  jq -cn \
    --arg sampledAt "$sampled_at" --argjson sampledEpoch "$sampled_epoch" \
    --argjson deployment "$deployment_json" --argjson pods "$pods_json" \
    --argjson observer "$observer_json" --argjson alerts "$alerts_json" '
      {
        sampledAt: $sampledAt,
        sampledEpoch: $sampledEpoch,
        desiredReplicas: ($deployment.spec.replicas // 0),
        readyReplicas: ($deployment.status.readyReplicas // 0),
        updatedReplicas: ($deployment.status.updatedReplicas // 0),
        unavailableReplicas: ($deployment.status.unavailableReplicas // 0),
        restartCount: ([$pods.items[]?.status.containerStatuses[]?.restartCount] | add // 0),
        cpuMillicores: ([$observer.pods[]? | select(.pod | startswith("cloud-reference-")) | .cpuMillicores] | add // 0),
        observerHealthy: ($observer.healthy == true),
        highCpuAlertsFiring: ([$alerts.data.alerts[]? | select(.labels.alertname == "KubernetesLasPodHighCpu" and .state == "firing")] | length)
      }' >>"$samples_path"

  if [[ "$sample_number" -lt "$samples_required" ]]; then sleep "$interval_seconds"; fi
done

mkdir -p "$evidence_dir"
SAMPLES_PATH="$samples_path" EVIDENCE_PATH="$evidence_path" TRACE="$trace" \
CORRELATION_ID="$correlation_id" ACTION_REFERENCE="$action_reference" \
SAMPLES_REQUIRED="$samples_required" MINIMUM_WINDOW_SECONDS="$minimum_window_seconds" CPU_LIMIT_MILLICORES="$cpu_limit_millicores" \
node scripts/evaluate-observation-window.mjs
sha256sum "$evidence_path" >"$evidence_path.sha256"
cat "$evidence_path"
cat "$evidence_path.sha256"
