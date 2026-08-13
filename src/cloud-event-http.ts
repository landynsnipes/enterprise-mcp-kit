import { randomUUID } from 'node:crypto';
import { CloudEventAuthorizationError, CloudEventConflictError, CloudEventValidationError, type CloudEventActor, type EnqueueResult } from './cloud-event-ingestion.js';

export interface CloudEventQueuePort { enqueue(actor: CloudEventActor, idempotencyKey: string, input: unknown): EnqueueResult | Promise<EnqueueResult>; }

export interface CloudEventHttpDependencies {
  queue: CloudEventQueuePort;
  authenticate: (authorization: string | null) => Promise<CloudEventActor>;
  newRequestId?: () => string;
}

export function createCloudEventHttpHandler(dependencies: CloudEventHttpDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = (dependencies.newRequestId ?? randomUUID)();
    if (new URL(request.url).pathname !== '/api/v1/cloud-events' || request.method !== 'POST') return json(404, requestId, null, [{ code: 'ROUTE_NOT_FOUND', message: 'Versioned cloud-event route was not found.' }]);
    try {
      const actor = await dependencies.authenticate(request.headers.get('authorization'));
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!idempotencyKey) throw new CloudEventValidationError('Idempotency-Key header is required.');
      const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'application/json') throw new CloudEventValidationError('Content-Type must be application/json.');
      const text = await request.text();
      if (Buffer.byteLength(text, 'utf8') > 64 * 1024) throw new CloudEventValidationError('Request body exceeds 64 KiB.');
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new CloudEventValidationError('Request body must be valid JSON.'); }
      const result = await dependencies.queue.enqueue(actor, idempotencyKey, body);
      return json(202, requestId, result, [], { replayed: result.replayed });
    } catch (error) {
      if (error instanceof CloudEventAuthorizationError) return json(403, requestId, null, [{ code: 'CLOUD_EVENT_FORBIDDEN', message: error.message }]);
      if (error instanceof CloudEventConflictError) return json(409, requestId, null, [{ code: 'IDEMPOTENCY_CONFLICT', message: error.message }]);
      if (error instanceof CloudEventValidationError) return json(400, requestId, null, [{ code: 'CLOUD_EVENT_INVALID', message: error.message }]);
      return json(500, requestId, null, [{ code: 'CLOUD_EVENT_INTERNAL', message: 'Cloud event ingestion failed safely.' }]);
    }
  };
}

function json(status: number, requestId: string, data: unknown, errors: { code: string; message: string }[], extraMeta: Record<string, unknown> = {}): Response {
  return Response.json({ data, meta: { requestId, ...extraMeta }, errors }, { status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } });
}
