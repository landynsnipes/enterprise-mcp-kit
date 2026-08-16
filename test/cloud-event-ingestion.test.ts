import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudEventAuthorizationError, CloudEventConflictError, CloudEventValidationError, InMemoryCloudEventQueue, eventDigest, type CloudOperationalEvent } from '../src/cloud-event-ingestion.js';

const actor = { subjectId: 'keycloak:cloud-ingestor', tenantId: 'open-enterprise-aiops', roles: ['cloud-event-ingestor'] };
const event = {
  version: 1 as const,
  eventId: '93c555b1-1a0d-4d0f-9924-9ba1cd41c001',
  tenantId: 'open-enterprise-aiops',
  siteId: 'azure-free-reference',
  source: 'local-k3s' as const,
  type: 'cloud.queue.backlog' as const,
  severity: 'warning' as const,
  observedAt: '2026-08-13T02:00:00.000Z',
  correlationId: 'corr-cloud-demo-001',
  decisionTraceId: 'dtr-cloud-demo-001',
  subject: 'orders-worker',
  evidence: [{ sourceRef: 'prometheus:cloud_queue_depth', summary: 'Queue depth exceeded the bounded demonstration threshold.', observedAt: '2026-08-13T02:00:00.000Z' }],
};

test('enqueues once and replays the same tenant-scoped event idempotently', () => {
  const queue = new InMemoryCloudEventQueue(() => new Date('2026-08-13T02:00:01.000Z'));
  const first = queue.enqueue(actor, 'cloud-event-0001', event);
  const replay = queue.enqueue(actor, 'cloud-event-0001', structuredClone(event));
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.eventId, event.eventId);
  assert.equal(queue.snapshot().pending.length, 1);
  assert.match(eventDigest(event), /^[a-f0-9]{64}$/);
});

test('rejects cross-tenant, unauthorized, unknown-field, and conflicting requests', () => {
  const queue = new InMemoryCloudEventQueue();
  assert.throws(() => queue.enqueue({ ...actor, tenantId: 'other-tenant' }, 'cloud-event-0002', event), CloudEventAuthorizationError);
  assert.throws(() => queue.enqueue({ ...actor, roles: [] }, 'cloud-event-0002', event), CloudEventAuthorizationError);
  assert.throws(() => queue.enqueue(actor, 'short', event), CloudEventValidationError);
  assert.throws(() => queue.enqueue(actor, 'cloud-event-0002', { ...event, token: 'must-not-pass' }), CloudEventValidationError);
  queue.enqueue(actor, 'cloud-event-0003', event);
  assert.throws(() => queue.enqueue(actor, 'cloud-event-0003', { ...event, severity: 'critical' }), CloudEventConflictError);
});

test('processes successfully while preserving trace context', async () => {
  const queue = new InMemoryCloudEventQueue();
  queue.enqueue(actor, 'cloud-event-0004', event);
  let observed: CloudOperationalEvent | undefined;
  assert.equal(await queue.processNext(async (item) => { observed = item; }), 'processed');
  assert.equal(observed?.correlationId, event.correlationId);
  assert.equal(observed?.decisionTraceId, event.decisionTraceId);
  assert.equal(queue.snapshot().pending.length, 0);
});

test('retries bounded failures then records a dead letter without losing evidence', async () => {
  const queue = new InMemoryCloudEventQueue(() => new Date('2026-08-13T02:01:00.000Z'));
  queue.enqueue(actor, 'cloud-event-0005', event);
  const fail = async () => { throw new Error('Synthetic worker dependency failure.'); };
  assert.equal(await queue.processNext(fail, 2), 'retrying');
  assert.equal(await queue.processNext(fail, 2), 'dead-lettered');
  const snapshot = queue.snapshot();
  assert.equal(snapshot.pending.length, 0);
  assert.equal(snapshot.deadLetters[0]?.item.attempts, 2);
  assert.equal(snapshot.deadLetters[0]?.item.event.decisionTraceId, event.decisionTraceId);
  assert.match(snapshot.deadLetters[0]?.reason ?? '', /Synthetic worker/);
});
