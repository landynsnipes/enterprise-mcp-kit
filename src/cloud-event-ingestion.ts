import { createHash } from 'node:crypto';
import { z } from 'zod';

const exactText = z.string().min(1).max(200).refine((value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value));
const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/);
const timestamp = z.iso.datetime({ offset: true });

export const cloudOperationalEventSchema = z.object({
  version: z.literal(1),
  eventId: z.uuid(),
  tenantId: identifier,
  siteId: identifier,
  source: z.enum(['azure-container-apps', 'local-k3s']),
  type: z.enum(['cloud.workload.health.degraded', 'cloud.queue.backlog']),
  severity: z.enum(['warning', 'critical']),
  observedAt: timestamp,
  correlationId: identifier,
  decisionTraceId: identifier,
  subject: exactText,
  evidence: z.array(z.object({ sourceRef: exactText, summary: exactText, observedAt: timestamp }).strict()).min(1).max(8),
}).strict();

export type CloudOperationalEvent = z.infer<typeof cloudOperationalEventSchema>;
export interface CloudEventActor { subjectId: string; tenantId: string; roles: string[]; }
export interface QueuedCloudEvent { event: CloudOperationalEvent; acceptedAt: string; attempts: number; }
export interface EnqueueResult { eventId: string; status: 'queued'; replayed: boolean; acceptedAt: string; }
export interface DeadLetter { item: QueuedCloudEvent; failedAt: string; reason: string; }

export class CloudEventValidationError extends Error {}
export class CloudEventAuthorizationError extends Error {}
export class CloudEventConflictError extends Error {}

export function validateCloudEventForActor(actor: CloudEventActor, idempotencyKey: string, input: unknown): CloudOperationalEvent {
  requireIngestRole(actor);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) throw new CloudEventValidationError('Idempotency key is invalid.');
  const parsed = cloudOperationalEventSchema.safeParse(input);
  if (!parsed.success) throw new CloudEventValidationError('Cloud operational event does not match the closed schema.');
  if (parsed.data.tenantId !== actor.tenantId) throw new CloudEventAuthorizationError('Cloud operational event is outside the actor tenant scope.');
  return structuredClone(parsed.data);
}

export class InMemoryCloudEventQueue {
  private readonly pending: QueuedCloudEvent[] = [];
  private readonly receipts = new Map<string, { digest: string; result: EnqueueResult }>();
  private readonly deadLetters: DeadLetter[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  enqueue(actor: CloudEventActor, idempotencyKey: string, input: unknown): EnqueueResult {
    const event = validateCloudEventForActor(actor, idempotencyKey, input);
    const digest = eventDigest(event);
    const receiptKey = `${actor.tenantId}:${idempotencyKey}`;
    const prior = this.receipts.get(receiptKey);
    if (prior) {
      if (prior.digest !== digest) throw new CloudEventConflictError('Idempotency key was already used for a different event.');
      return { ...prior.result, replayed: true };
    }
    const acceptedAt = this.now().toISOString();
    const result: EnqueueResult = { eventId: event.eventId, status: 'queued', replayed: false, acceptedAt };
    this.pending.push({ event, acceptedAt, attempts: 0 });
    this.receipts.set(receiptKey, { digest, result });
    return structuredClone(result);
  }

  async processNext(handler: (event: CloudOperationalEvent) => Promise<void>, maxAttempts = 3): Promise<'empty' | 'processed' | 'retrying' | 'dead-lettered'> {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new CloudEventValidationError('Maximum attempts must be between 1 and 10.');
    const item = this.pending.shift();
    if (!item) return 'empty';
    item.attempts += 1;
    try {
      await handler(structuredClone(item.event));
      return 'processed';
    } catch (error) {
      const reason = error instanceof Error ? bounded(error.message) : 'Worker failed with a bounded unknown error.';
      if (item.attempts >= maxAttempts) {
        this.deadLetters.push({ item: structuredClone(item), failedAt: this.now().toISOString(), reason });
        return 'dead-lettered';
      }
      this.pending.push(item);
      return 'retrying';
    }
  }

  snapshot(): { pending: QueuedCloudEvent[]; deadLetters: DeadLetter[] } {
    return { pending: structuredClone(this.pending), deadLetters: structuredClone(this.deadLetters) };
  }
}

export function eventDigest(event: CloudOperationalEvent): string {
  return createHash('sha256').update(JSON.stringify(canonical(event))).digest('hex');
}

function requireIngestRole(actor: CloudEventActor): void {
  if (!actor || !identifier.safeParse(actor.tenantId).success || !exactText.safeParse(actor.subjectId).success || !Array.isArray(actor.roles) || !actor.roles.includes('cloud-event-ingestor')) throw new CloudEventAuthorizationError('Actor lacks the admitted cloud event ingestion role.');
}
function bounded(value: string): string { return value.length > 300 ? `${value.slice(0, 297)}...` : value; }
function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])); return value; }
