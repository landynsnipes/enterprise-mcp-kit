#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
evidence_dir='delivery-evidence/kubernetes'
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
samples_path="$workdir/telemetry-loss-samples.ndjson"
evaluator_evidence="$workdir/evaluator-evidence.json"
evidence_path="$evidence_dir/at05-telemetry-loss.json"
start_epoch="$(date +%s)"
trace="at05-telemetry-loss-$(date -u +%Y%m%dT%H%M%SZ)"
correlation_id="at05-telemetry-loss-$(date -u +%Y%m%dT%H%M%SZ)"

START_EPOCH="$start_epoch" SAMPLES_PATH="$samples_path" node --input-type=module -e '
  import { writeFileSync } from "node:fs";
  const start = Number(process.env.START_EPOCH);
  const samples = [0, 1, 2].map((offset) => ({
    sampledAt: new Date((start + offset) * 1000).toISOString(),
    sampledEpoch: start + offset,
    desiredReplicas: 2,
    readyReplicas: 2,
    updatedReplicas: 2,
    unavailableReplicas: 0,
    restartCount: 0,
    cpuMillicores: 1,
    observerHealthy: false,
    highCpuAlertsFiring: 0,
  }));
  writeFileSync(process.env.SAMPLES_PATH, `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`, { mode: 0o600 });
'

set +e
SAMPLES_PATH="$samples_path" EVIDENCE_PATH="$evaluator_evidence" TRACE="$trace" \
CORRELATION_ID="$correlation_id" ACTION_REFERENCE='at05-negative-telemetry-loss' \
SAMPLES_REQUIRED=3 MINIMUM_WINDOW_SECONDS=2 CPU_LIMIT_MILLICORES=150 \
node scripts/evaluate-observation-window.mjs
evaluator_status=$?
set -e
[[ "$evaluator_status" -eq 1 ]] || { echo "Telemetry-loss evaluator unexpectedly returned $evaluator_status." >&2; exit 1; }

mkdir -p "$evidence_dir"
EVALUATOR_EVIDENCE="$evaluator_evidence" EVIDENCE_PATH="$evidence_path" TRACE="$trace" CORRELATION_ID="$correlation_id" node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const evaluator = JSON.parse(readFileSync(process.env.EVALUATOR_EVIDENCE, "utf8"));
  if (evaluator.result !== "non-success" || JSON.stringify(evaluator.failures) !== JSON.stringify(["telemetry_unavailable"])) process.exit(1);
  const evidence = {
    schemaVersion: 1,
    acceptanceTest: "AT-05",
    scenario: "telemetry-loss-fails-closed",
    result: "passed",
    evaluatorResult: evaluator.result,
    failures: evaluator.failures,
    unknownState: true,
    telemetrySamplesAvailable: evaluator.summary.telemetrySamplesAvailable,
    samples: evaluator.summary.samples,
    correlationId: process.env.CORRELATION_ID,
    decisionTraceId: process.env.TRACE,
    sourceOwner: "Kubernetes Metrics API via Prometheus observer",
    expectedBehavior: "Unavailable telemetry produces non-success and never verifies a remediation outcome.",
    autonomousRemediation: false,
    claimsBoundary: "Deterministic telemetry-loss negative proof for one logical LAS workload; no live service was disrupted and no independent-site HA is claimed.",
  };
  writeFileSync(process.env.EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ result: evidence.result, acceptanceTest: evidence.acceptanceTest, scenario: evidence.scenario, evaluatorResult: evidence.evaluatorResult, failures: evidence.failures, unknownState: evidence.unknownState, correlationId: evidence.correlationId, decisionTraceId: evidence.decisionTraceId }));
'
sha256sum "$evidence_path" >"$evidence_path.sha256"
cat "$evidence_path"
cat "$evidence_path.sha256"
