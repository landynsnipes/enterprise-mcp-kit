#!/usr/bin/env bash
set -euo pipefail

site="${1:-}"
action="${2:-deploy}"
revision="${CI_COMMIT_SHA:-}"
pipeline="${CI_PIPELINE_ID:-}"
case "$site" in las|chi) ;; *) echo 'site must be las or chi' >&2; exit 2;; esac
case "$action" in deploy|rollback) ;; *) echo 'action must be deploy or rollback' >&2; exit 2;; esac
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'CI_COMMIT_SHA must be an exact lowercase SHA-1.' >&2; exit 2; }
[[ "$pipeline" =~ ^[1-9][0-9]{0,18}$ ]] || { echo 'CI_PIPELINE_ID must be a positive integer.' >&2; exit 2; }

if [[ "$site" == las ]]; then namespace='cloud-reference'; else namespace='cloud-reference-chi'; fi
deployment='cloud-reference'
trace="gitlab-pipeline-$pipeline"
evidence_dir="delivery-evidence/$site"
mkdir -p "$evidence_dir"

before_revision="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null || true)"
before_image="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"

if [[ "$action" == deploy ]]; then
  source_manifest="k8s/delivery/$site/workload.yaml"
  rendered="$(mktemp)"
  trap 'rm -f "$rendered"' EXIT
  sed -e "s/__REVISION__/$revision/g" -e "s/__PIPELINE__/$pipeline/g" "$source_manifest" >"$rendered"
  kubectl apply --dry-run=server -f "$rendered" >/dev/null
  kubectl apply -f "$rendered"
else
  [[ -n "$before_revision" && "$before_revision" != 1 ]] || { echo 'No prior Kubernetes revision is available for rollback.' >&2; exit 1; }
  kubectl -n "$namespace" rollout undo "deployment/$deployment"
fi

kubectl -n "$namespace" rollout status "deployment/$deployment" --timeout=120s
available="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.status.availableReplicas}')"
desired="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.spec.replicas}')"
after_revision="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}')"
after_image="$(kubectl -n "$namespace" get deployment "$deployment" -o jsonpath='{.spec.template.spec.containers[0].image}')"
[[ "$available" == "$desired" ]] || { echo "Available replicas $available do not match desired replicas $desired." >&2; exit 1; }

EVIDENCE_ACTION="$action" EVIDENCE_SITE="$site" EVIDENCE_NAMESPACE="$namespace" \
EVIDENCE_TRACE="$trace" EVIDENCE_COMMIT="$revision" EVIDENCE_PIPELINE="$pipeline" \
EVIDENCE_BEFORE_REVISION="$before_revision" EVIDENCE_AFTER_REVISION="$after_revision" \
EVIDENCE_BEFORE_IMAGE="$before_image" EVIDENCE_AFTER_IMAGE="$after_image" \
EVIDENCE_DESIRED="$desired" EVIDENCE_AVAILABLE="$available" \
  node scripts/render-delivery-evidence.mjs | tee "$evidence_dir/$action.json"
sha256sum "$evidence_dir/$action.json" | tee "$evidence_dir/$action.sha256"
