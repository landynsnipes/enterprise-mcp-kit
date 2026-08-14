import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const evaluator = resolve('scripts/evaluate-observation-window.mjs');

function run(observerHealthy: boolean) {
  const workdir = mkdtempSync(`${tmpdir()}/enterprise-mcp-at09-`);
  const samplesPath = `${workdir}/samples.ndjson`;
  const evidencePath = `${workdir}/evidence.json`;
  const samples = [0, 150, 300].map((offset) => ({
    sampledAt: new Date(Date.parse('2026-08-14T00:00:00Z') + offset * 1000).toISOString(),
    sampledEpoch: 1_786_665_600 + offset,
    desiredReplicas: 2,
    readyReplicas: 2,
    updatedReplicas: 2,
    unavailableReplicas: 0,
    restartCount: 0,
    cpuMillicores: 1.25,
    observerHealthy,
    highCpuAlertsFiring: 0,
  }));
  writeFileSync(samplesPath, `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`, { mode: 0o600 });
  const result = spawnSync(process.execPath, [evaluator], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SAMPLES_PATH: samplesPath,
      EVIDENCE_PATH: evidencePath,
      TRACE: 'gitlab-pipeline-test',
      CORRELATION_ID: 'at09-test-correlation',
      ACTION_REFERENCE: 'test-approved-action',
      SAMPLES_REQUIRED: '3',
      MINIMUM_WINDOW_SECONDS: '300',
      CPU_LIMIT_MILLICORES: '150',
    },
  });
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  rmSync(workdir, { recursive: true, force: true });
  return { result, evidence };
}

test('passes a complete healthy post-action observation window', () => {
  const { result, evidence } = run(true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(evidence.result, 'passed');
  assert.equal(evidence.durationSeconds, 300);
  assert.equal(evidence.summary.telemetrySamplesAvailable, 3);
});

test('records non-success and fails closed when telemetry is unavailable', () => {
  const { result, evidence } = run(false);
  assert.equal(result.status, 1);
  assert.equal(evidence.result, 'non-success');
  assert.deepEqual(evidence.failures, ['telemetry_unavailable']);
});
