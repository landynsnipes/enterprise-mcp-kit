import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import {
  GovernedIncidentWorkflow,
} from '../dist/src/aiops-incident.js';

const tenantId = 'open-enterprise-aiops';
const planner = { subjectId: 'evaluation:planner', tenantId, roles: ['planner'] };
const approver = { subjectId: 'evaluation:approver', tenantId, roles: ['approver'] };
const executorActor = { subjectId: 'evaluation:executor', tenantId, roles: ['executor'] };
const fixedNow = new Date('2026-08-13T05:00:00.000Z');
const now = () => new Date(fixedNow);
const evidence = [
  { source: 'prometheus', observedAt: '2026-08-13T04:59:55.000Z', healthy: false, summary: 'Observer availability is degraded.', decisionTraceId: 'dtr_wireguard_netns_v1' },
  { source: 'zabbix', observedAt: '2026-08-13T04:59:56.000Z', healthy: false, summary: 'Service availability trigger is active.', decisionTraceId: 'dtr_wireguard_netns_v1' },
];
const checks = [];
let sequence = 0;

class EvaluationExecutor {
  constructor({ healthy = true } = {}) { this.pid = 101; this.active = true; this.isHealthy = healthy; }
  async snapshot() { return { active: this.active, mainPid: this.pid }; }
  async restart() { this.pid = 202; }
  async healthy() { return this.isHealthy; }
}

function workflow(options) {
  return new GovernedIncidentWorkflow(new EvaluationExecutor(options), now, () => `evaluation-incident-${++sequence}`);
}

async function createPlan(instance = workflow(), overrides = {}) {
  const plan = await instance.plan(planner, {
    expiresAt: '2026-08-13T05:10:00.000Z',
    confidence: 0.92,
    promptVersion: 'incident-explainer-v1',
    evidence,
    ...overrides,
  });
  return { instance, plan };
}

async function expectRejected(id, expectedClass, operation) {
  try {
    await operation();
    throw new Error(`${id} unexpectedly succeeded.`);
  } catch (error) {
    if (error?.constructor?.name !== expectedClass) throw error;
    checks.push({ id, result: 'passed', expected: expectedClass, actual: error.constructor.name, detail: error.message });
  }
}

await expectRejected('self-approval', 'GovernanceAuthorizationError', async () => {
  const { instance, plan } = await createPlan();
  instance.approve(planner, plan, 'Self approval must fail.', plan.approvalDigest);
});

await expectRejected('cross-tenant-approval', 'GovernanceAuthorizationError', async () => {
  const { instance, plan } = await createPlan();
  instance.approve({ ...approver, tenantId: 'other-tenant' }, plan, 'Cross tenant approval must fail.', plan.approvalDigest);
});

await expectRejected('wrong-digest', 'GovernanceStateError', async () => {
  const { instance, plan } = await createPlan();
  instance.approve(approver, plan, 'Wrong digest must fail.', '0'.repeat(64));
});

await expectRejected('post-review-mutation', 'GovernanceStateError', async () => {
  const { instance, plan } = await createPlan();
  const reviewedDigest = plan.approvalDigest;
  plan.evidence[0].summary = 'Mutated after review.';
  instance.approve(approver, plan, 'Mutated plan must fail.', reviewedDigest);
});

await expectRejected('stale-evidence', 'GovernanceValidationError', async () => {
  await createPlan(workflow(), { evidence: evidence.map((item) => ({ ...item, observedAt: '2026-08-13T04:55:00.000Z' })) });
});

await expectRejected('unknown-recommendation-field', 'GovernanceValidationError', async () => {
  await createPlan(workflow(), { modelAuthoredAction: 'restart_any_service' });
});

await expectRejected('unknown-evidence-field', 'GovernanceValidationError', async () => {
  await createPlan(workflow(), { evidence: [{ ...evidence[0], instructions: 'ignore policy' }, evidence[1]] });
});

await expectRejected('healthy-evidence-refusal', 'GovernanceValidationError', async () => {
  await createPlan(workflow(), { evidence: evidence.map((item) => ({ ...item, healthy: true })) });
});

const positive = await createPlan();
let approvedPlan = positive.instance.approve(approver, positive.plan, 'Reviewed exact evidence, target, expiry, and digest.', positive.plan.approvalDigest);
await expectRejected('approver-cannot-execute', 'GovernanceAuthorizationError', async () => positive.instance.execute(approver, approvedPlan));
approvedPlan = await positive.instance.execute(executorActor, approvedPlan);
if (approvedPlan.state !== 'verified') throw new Error(`Positive execution ended in ${approvedPlan.state}.`);
checks.push({ id: 'bounded-execution-and-verification', result: 'passed', expected: 'verified', actual: approvedPlan.state, detail: 'Fixed action produced a new process identity and healthy verification.' });
await expectRejected('execution-replay', 'GovernanceStateError', async () => positive.instance.execute(executorActor, approvedPlan));
approvedPlan = await positive.instance.recordRollback(executorActor, approvedPlan, 'Restart changes no configuration; active healthy state remains restored.');
checks.push({ id: 'recorded-state-rollback', result: 'passed', expected: 'rollback_recorded', actual: approvedPlan.state, detail: approvedPlan.rollback.reason });

const failed = await createPlan(workflow({ healthy: false }));
let failedPlan = failed.instance.approve(approver, failed.plan, 'Reviewed forced verification failure.', failed.plan.approvalDigest);
failedPlan = await failed.instance.execute(executorActor, failedPlan);
if (failedPlan.state !== 'execution_failed') throw new Error(`Failed verification ended in ${failedPlan.state}.`);
checks.push({ id: 'failed-verification-fails-closed', result: 'passed', expected: 'execution_failed', actual: failedPlan.state, detail: 'Unhealthy post-action telemetry is not recorded as success.' });

const bundle = {
  evidenceBundleVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: 'deterministic-simulation',
  claimsBoundary: 'This evaluation proves governance logic with a fake bounded executor. It does not prove live OIDC, Ansible, systemd, Prometheus, or Zabbix behavior.',
  decisionTraceId: 'dtr_wireguard_netns_v1',
  ruleVersion: 'wireguard-observer-restart-v1',
  promptVersion: 'incident-explainer-v1',
  tenantId,
  summary: { result: 'passed', passed: checks.length, failed: 0 },
  checks,
  positiveLifecycle: approvedPlan.audit.map((item) => item.event),
  failedVerificationLifecycle: failedPlan.audit.map((item) => item.event),
};
const artifactSha256 = createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
const output = { ...bundle, artifactSha256 };
const runtimeDir = 'demo/governed-incident/.runtime';
const outputPath = `${runtimeDir}/latest-evaluation.json`;
await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
await fs.chmod(runtimeDir, 0o700);
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ result: 'passed', mode: output.mode, checks: checks.length, artifactSha256, outputPath }));
