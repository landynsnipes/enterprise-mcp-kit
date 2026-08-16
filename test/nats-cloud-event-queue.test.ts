import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudEventConflictError } from '../src/cloud-event-ingestion.js';
import { NatsCloudEventPublisher, CLOUD_EVENT_SUBJECT, processNextCloudEvent, type CloudEventReceiptStore } from '../src/nats-cloud-event-queue.js';

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(value));

const actor = { subjectId: 'keycloak:cloud-ingestor', tenantId: 'open-enterprise-aiops', roles: ['cloud-event-ingestor'] };
const event = {
  version: 1 as const,
  eventId: '93c555b1-1a0d-4d0f-9924-9ba1cd41c001', tenantId: 'open-enterprise-aiops', siteId: 'local-cloud-reference', source: 'local-k3s' as const,
  type: 'cloud.queue.backlog' as const, severity: 'warning' as const, observedAt: '2026-08-13T02:00:00.000Z', correlationId: 'corr-cloud-demo-001', decisionTraceId: 'dtr-cloud-demo-001', subject: 'orders-worker',
  evidence: [{ sourceRef: 'prometheus:cloud_queue_depth', summary: 'Queue depth exceeded the bounded demonstration threshold.', observedAt: '2026-08-13T02:00:00.000Z' }],
};

class MemoryReceiptStore implements CloudEventReceiptStore {
  private readonly receipts = new Map<string, { digest: string; eventId: string; acceptedAt: string }>();
  async claim(messageId: string, receipt: { digest: string; eventId: string; acceptedAt: string }) {
    const prior = this.receipts.get(messageId);
    if (prior) return { created: false, receipt: prior };
    this.receipts.set(messageId, receipt);
    return { created: true, receipt };
  }
}

test('publishes a validated tenant event with a stable JetStream message id', async () => {
  const calls: Array<{ subject: string; payload: Uint8Array; msgID: string }> = [];
  const publisher = new NatsCloudEventPublisher({ publish: async (subject, payload, options) => { calls.push({ subject, payload, msgID: options.msgID }); return { duplicate: false }; } }, new MemoryReceiptStore(), () => new Date('2026-08-13T02:00:01.000Z'));
  const result = await publisher.enqueue(actor, 'cloud-event-0001', event);
  assert.equal(result.replayed, false);
  assert.equal(calls[0]?.subject, CLOUD_EVENT_SUBJECT);
  assert.equal(calls[0]?.msgID, 'open-enterprise-aiops:cloud-event-0001');
  assert.deepEqual(decode(calls[0]!.payload), event);
});

test('reports a broker-side duplicate as an idempotent replay', async () => {
  const publisher = new NatsCloudEventPublisher({ publish: async () => ({ duplicate: true }) }, new MemoryReceiptStore());
  assert.equal((await publisher.enqueue(actor, 'cloud-event-0002', event)).replayed, true);
});

test('rejects reuse of an idempotency key for a changed payload before publishing again', async () => {
  let publishes = 0;
  const publisher = new NatsCloudEventPublisher({ publish: async () => { publishes += 1; return { duplicate: false }; } }, new MemoryReceiptStore());
  await publisher.enqueue(actor, 'cloud-event-0003', event);
  await assert.rejects(() => publisher.enqueue(actor, 'cloud-event-0003', { ...event, severity: 'critical' }), CloudEventConflictError);
  assert.equal(publishes, 1);
});

test('preserves the first acceptance result across publisher restarts', async () => {
  const receipts = new MemoryReceiptStore();
  const publish = async () => ({ duplicate: false });
  const first = new NatsCloudEventPublisher({ publish }, receipts, () => new Date('2026-08-13T02:00:01.000Z'));
  const restarted = new NatsCloudEventPublisher({ publish }, receipts, () => new Date('2026-08-13T03:00:01.000Z'));
  const accepted = await first.enqueue(actor, 'cloud-event-restart-0001', event);
  const replayed = await restarted.enqueue(actor, 'cloud-event-restart-0001', structuredClone(event));
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.eventId, accepted.eventId);
  assert.equal(replayed.acceptedAt, accepted.acceptedAt);
  await assert.rejects(() => restarted.enqueue(actor, 'cloud-event-restart-0001', { ...event, severity: 'critical' }), CloudEventConflictError);
});

function fakeMessage(data: Uint8Array, deliveryCount = 1) {
  const actions: string[] = [];
  return { data, info: { deliveryCount }, ack: () => actions.push('ack'), nak: () => actions.push('nak'), term: () => actions.push('term'), actions };
}

test('acks valid processed messages and preserves decision tracing', async () => {
  const message = fakeMessage(encode(event));
  let trace = '';
  const outcome = await processNextCloudEvent({ next: async () => message as never }, async (item) => { trace = item.decisionTraceId; });
  assert.equal(outcome, 'processed');
  assert.equal(trace, event.decisionTraceId);
  assert.deepEqual(message.actions, ['ack']);
});

test('naks bounded transient failures and terminates invalid or exhausted messages', async () => {
  const transient = fakeMessage(encode(event), 2);
  assert.equal(await processNextCloudEvent({ next: async () => transient as never }, async () => { throw new Error('dependency unavailable'); }), 'retrying');
  assert.deepEqual(transient.actions, ['nak']);
  const exhausted = fakeMessage(encode(event), 3);
  assert.equal(await processNextCloudEvent({ next: async () => exhausted as never }, async () => { throw new Error('still unavailable'); }), 'dead-lettered');
  assert.deepEqual(exhausted.actions, ['term']);
  const invalid = fakeMessage(encode({ ...event, secret: 'rejected' }));
  assert.equal(await processNextCloudEvent({ next: async () => invalid as never }, async () => undefined), 'dead-lettered');
  assert.deepEqual(invalid.actions, ['term']);
});
