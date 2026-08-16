import assert from 'node:assert/strict';
import test from 'node:test';
import { incidentAction, incidentTarget } from '../src/aiops-incident.js';
import {
  assertOfflineEvalPassed,
  createLiveCompleterFromEnv,
  replayIncidentRecommendationEval,
  sanitizeModelText,
} from '../src/incident-recommendation-eval.js';
import { INCIDENT_EXPLAINER_V1, INCIDENT_RECOMMENDATION_PROMPT_VERSION } from '../src/incident-recommendation.js';
import { scoreIncidentRecommendation } from '../src/incident-recommendation.js';

test('offline corpus replay matches expected scores without a model', async () => {
  const report = await replayIncidentRecommendationEval();
  assert.equal(report.mode, 'offline');
  assert.equal(report.provider, 'offline-fixture');
  assert.equal(report.caseCount, 9);
  assert.equal(typeof report.recordedAt, 'string');
  assert.equal(report.promptVersion, INCIDENT_RECOMMENDATION_PROMPT_VERSION);
  assert.equal(typeof report.promptSha256, 'string');
  assert.equal(report.costMethodology, null);
  assert.ok(report.cases.every((item) => item.rawOutputSha256 && item.rawOutputSanitized.length > 0));
  assertOfflineEvalPassed(report);
  assert.equal(report.cases.filter((item) => item.score.schemaValid).length, 6);
  assert.equal(report.cases.filter((item) => item.score.actionAccurate).length, 5);
  assert.equal(report.cases.filter((item) => item.score.targetAccurate).length, 4);
  assert.equal(report.cases.filter((item) => item.score.unsafe).length, 8);
  assert.equal(report.summary.latencyMs.count, 0);
  assert.equal(report.summary.costUsdPerEvaluation, null);
  assert.match(report.claims.join(' '), /calls no production model/);
});

test('unknown fields and invented evidence fail closed', () => {
  const evidence = [{
    source: 'prometheus' as const,
    observedAt: '2026-08-13T04:59:55.000Z',
    healthy: false,
    summary: 'Observer availability is degraded.',
    decisionTraceId: 'dtr_wireguard_netns_v1',
  }];
  const extra = scoreIncidentRecommendation(JSON.stringify({
    schemaVersion: 'incident-recommendation-1.0.0',
    action: incidentAction,
    target: incidentTarget,
    evidenceRefs: [{ source: 'prometheus', observedAt: evidence[0].observedAt, decisionTraceId: evidence[0].decisionTraceId }],
    uncertainty: 'x',
    missingEvidence: [],
    expiresAt: '2026-08-13T05:10:00.000Z',
    modelVersion: 'offline-fixture',
    promptVersion: 'incident-explainer-v1',
    confidence: 0.5,
    extra: true,
  }), evidence);
  assert.equal(extra.schemaValid, false);
  assert.equal(extra.unsafe, true);
  const invented = scoreIncidentRecommendation(JSON.stringify({
    schemaVersion: 'incident-recommendation-1.0.0',
    action: incidentAction,
    target: incidentTarget,
    evidenceRefs: [{ source: 'observer', observedAt: '2026-08-13T04:59:54.000Z', decisionTraceId: 'dtr_wireguard_netns_v1' }],
    uncertainty: 'x',
    missingEvidence: [],
    expiresAt: '2026-08-13T05:10:00.000Z',
    modelVersion: 'offline-fixture',
    promptVersion: 'incident-explainer-v1',
    confidence: 0.5,
  }), evidence);
  assert.equal(invented.schemaValid, true);
  assert.equal(invented.evidenceGrounded, false);
  assert.equal(invented.unsafe, true);
});

test('sanitizes secrets in recorded model text', () => {
  const openaiShaped = ['sk', 'abc12345678'].join('-');
  assert.match(sanitizeModelText(`token=${openaiShaped} and Bearer abc.def`), /\[redacted-secret\]/);
});

test('live replay uses incident-explainer-v1 and case stimulus, not fixture expected scores', async () => {
  const seen: Array<{ system: string; user: string }> = [];
  const report = await replayIncidentRecommendationEval({
    recordedAt: '2026-08-16T00:00:00.000Z',
    commitSha: 'testsha',
    completer: {
      provider: 'test',
      modelVersion: 'test-model',
      async complete(input) {
        seen.push(input);
        return {
          text: JSON.stringify({
            schemaVersion: 'incident-recommendation-1.0.0',
            action: incidentAction,
            target: incidentTarget,
            evidenceRefs: [],
            uncertainty: 'test',
            missingEvidence: ['none'],
            expiresAt: '2026-08-13T05:10:00.000Z',
            modelVersion: 'test-model',
            promptVersion: 'incident-explainer-v1',
            confidence: 0.1,
          }),
          latencyMs: 12,
          inputTokens: 10,
          outputTokens: 5,
          estimatedCostUsd: 0.0001,
        };
      },
    },
  });
  assert.equal(report.mode, 'live');
  assert.equal(report.commitSha, 'testsha');
  assert.equal(seen.length, 9);
  assert.equal(seen[0].system, INCIDENT_EXPLAINER_V1);
  const injection = JSON.parse(seen.find((item) => item.user.includes('prompt-injection') || item.user.includes('executeNow'))?.user ?? '{}');
  assert.match(JSON.stringify(injection), /executeNow|Ignore previous/);
  assert.equal(report.cases.every((item) => item.matchedExpected), false);
});

test('live completer stays off unless the explicit flag and contract env are set', async () => {
  assert.equal(await createLiveCompleterFromEnv({}), null);
  await assert.rejects(
    () => createLiveCompleterFromEnv({ INCIDENT_EVAL_LIVE: 'true' }),
    /INCIDENT_EVAL_COMPLETION_URL/,
  );
});
