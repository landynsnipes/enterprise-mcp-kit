import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryCloudEventQueue } from '../src/cloud-event-ingestion.js';
import { createCloudEventHttpHandler } from '../src/cloud-event-http.js';

const actor = { subjectId: 'keycloak:cloud-ingestor', tenantId: 'open-enterprise-aiops', roles: ['cloud-event-ingestor'] };
const event = { version: 1, eventId: '93c555b1-1a0d-4d0f-9924-9ba1cd41c001', tenantId: 'open-enterprise-aiops', siteId: 'azure-free-reference', source: 'local-k3s', type: 'cloud.queue.backlog', severity: 'warning', observedAt: '2026-08-13T02:00:00.000Z', correlationId: 'corr-cloud-demo-001', decisionTraceId: 'dtr-cloud-demo-001', subject: 'orders-worker', evidence: [{ sourceRef: 'prometheus:cloud_queue_depth', summary: 'Queue depth exceeded the bounded demonstration threshold.', observedAt: '2026-08-13T02:00:00.000Z' }] };

test('accepts a versioned authenticated event and reports idempotent replay', async () => {
  const handler = createCloudEventHttpHandler({ queue: new InMemoryCloudEventQueue(), authenticate: async () => actor, newRequestId: () => 'req-cloud-001' });
  const request = () => new Request('http://localhost/api/v1/cloud-events', { method: 'POST', headers: { authorization: 'Bearer verified-upstream', 'content-type': 'application/json', 'idempotency-key': 'cloud-http-0001' }, body: JSON.stringify(event) });
  const first = await handler(request());
  const replay = await handler(request());
  assert.equal(first.status, 202);
  assert.equal(replay.status, 202);
  assert.equal((await first.json()).meta.replayed, false);
  assert.equal((await replay.json()).meta.replayed, true);
  assert.equal(replay.headers.get('x-request-id'), 'req-cloud-001');
});

test('returns bounded structured errors for auth, content, and route failures', async () => {
  const authFailure = createCloudEventHttpHandler({ queue: new InMemoryCloudEventQueue(), authenticate: async () => { throw new Error('token internals must not leak'); }, newRequestId: () => 'req-cloud-002' });
  const forbidden = await authFailure(new Request('http://localhost/api/v1/cloud-events', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'cloud-http-0002' }, body: JSON.stringify(event) }));
  assert.equal(forbidden.status, 500);
  assert.deepEqual(await forbidden.json(), { data: null, meta: { requestId: 'req-cloud-002' }, errors: [{ code: 'CLOUD_EVENT_INTERNAL', message: 'Cloud event ingestion failed safely.' }] });
  const handler = createCloudEventHttpHandler({ queue: new InMemoryCloudEventQueue(), authenticate: async () => actor, newRequestId: () => 'req-cloud-003' });
  const invalid = await handler(new Request('http://localhost/api/v1/cloud-events', { method: 'POST', headers: { 'content-type': 'text/plain', 'idempotency-key': 'cloud-http-0003' }, body: '{}' }));
  assert.equal(invalid.status, 400);
  const missing = await handler(new Request('http://localhost/api/v2/cloud-events', { method: 'POST' }));
  assert.equal(missing.status, 404);
});

test('rejects a conflicting idempotency key at the HTTP boundary', async () => {
  const handler = createCloudEventHttpHandler({ queue: new InMemoryCloudEventQueue(), authenticate: async () => actor });
  const send = (body: unknown) => handler(new Request('http://localhost/api/v1/cloud-events', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'cloud-http-0004' }, body: JSON.stringify(body) }));
  assert.equal((await send(event)).status, 202);
  const conflict = await send({ ...event, severity: 'critical' });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).errors[0].code, 'IDEMPOTENCY_CONFLICT');
});
