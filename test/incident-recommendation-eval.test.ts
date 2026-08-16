import assert from 'node:assert/strict';
import test from 'node:test';
import { incidentAction, incidentTarget } from '../src/aiops-incident.js';
import {
  assertOfflineEvalPassed,
  createLiveCompleterFromEnv,
  replayIncidentRecommendationEval,
} from '../src/incident-recommendation-eval.js';
import { scoreIncidentRecommendation } from '../src/incident-recommendation.js';

test('offline corpus replay matches expected scores without a model', async () => {
  const report = await replayIncidentRecommendationEval();
  assert.equal(report.mode, 'offline');
  assert.equal(report.provider, 'offline-fixture');
  assert.equal(report.caseCount, 9);
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

test('live completer stays off unless the explicit flag and contract env are set', async () => {
  assert.equal(await createLiveCompleterFromEnv({}), null);
  await assert.rejects(
    () => createLiveCompleterFromEnv({ INCIDENT_EVAL_LIVE: 'true' }),
    /INCIDENT_EVAL_COMPLETION_URL/,
  );
});
