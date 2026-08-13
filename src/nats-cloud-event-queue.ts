import { createHash } from 'node:crypto';
import { AckPolicy, DeliverPolicy, DiscardPolicy, RetentionPolicy, StorageType, jetstream, jetstreamManager, type Consumer, type JetStreamClient, type JetStreamManager, type JsMsg } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';
import { z } from 'zod';
import { CloudEventConflictError, cloudOperationalEventSchema, eventDigest, validateCloudEventForActor, type CloudEventActor, type CloudOperationalEvent, type EnqueueResult } from './cloud-event-ingestion.js';

export const CLOUD_EVENT_STREAM = 'AIOPS_CLOUD_EVENTS';
export const CLOUD_EVENT_SUBJECT = 'aiops.cloud.events.v1';
export const CLOUD_EVENT_CONSUMER = 'aiops-cloud-worker-v1';
export const CLOUD_EVENT_RECEIPT_STREAM = 'AIOPS_CLOUD_EVENT_RECEIPTS';
export const CLOUD_EVENT_RECEIPT_SUBJECT_PREFIX = 'aiops.cloud.receipts.v1';
const DEAD_LETTER_SUBJECT = 'aiops.cloud.events.dead.v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface JetStreamPublishPort {
  publish(subject: string, payload: Uint8Array, options: { msgID: string; expect?: { streamName?: string; lastSubjectSequence?: number } }): Promise<{ duplicate: boolean }>;
}

const receiptSchema = z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/), eventId: z.uuid(), acceptedAt: z.iso.datetime({ offset: true }) }).strict();
type CloudEventReceipt = z.infer<typeof receiptSchema>;

export interface CloudEventReceiptStore {
  claim(messageId: string, receipt: CloudEventReceipt): Promise<{ created: boolean; receipt: CloudEventReceipt }>;
}

export class NatsCloudEventPublisher {
  constructor(private readonly publisher: JetStreamPublishPort, private readonly receiptStore: CloudEventReceiptStore, private readonly now: () => Date = () => new Date()) {}

  async enqueue(actor: CloudEventActor, idempotencyKey: string, input: unknown): Promise<EnqueueResult> {
    const event = validateCloudEventForActor(actor, idempotencyKey, input);
    const messageId = `${actor.tenantId}:${idempotencyKey}`;
    const digest = eventDigest(event);
    const acceptedAt = this.now().toISOString();
    const claim = await this.receiptStore.claim(messageId, { digest, eventId: event.eventId, acceptedAt });
    if (claim.receipt.digest !== digest) throw new CloudEventConflictError('Idempotency key was already used for a different event.');
    const acknowledgement = await this.publisher.publish(CLOUD_EVENT_SUBJECT, encodeEvent(event), { msgID: messageId });
    return { eventId: claim.receipt.eventId, status: 'queued', replayed: !claim.created || acknowledgement.duplicate, acceptedAt: claim.receipt.acceptedAt };
  }
}

export class NatsCloudEventReceiptStore implements CloudEventReceiptStore {
  constructor(private readonly manager: JetStreamManager, private readonly publisher: JetStreamPublishPort) {}

  async claim(messageId: string, receipt: CloudEventReceipt): Promise<{ created: boolean; receipt: CloudEventReceipt }> {
    const subject = receiptSubject(messageId);
    const prior = await this.read(subject);
    if (prior) return { created: false, receipt: prior };
    try {
      await this.publisher.publish(subject, encoder.encode(JSON.stringify(receipt)), {
        msgID: `receipt:${eventDigestKey(messageId)}`,
        expect: { streamName: CLOUD_EVENT_RECEIPT_STREAM, lastSubjectSequence: 0 },
      });
      return { created: true, receipt };
    } catch (error) {
      const winner = await this.read(subject);
      if (winner) return { created: false, receipt: winner };
      throw error;
    }
  }

  private async read(subject: string): Promise<CloudEventReceipt | undefined> {
    const stored = await this.manager.direct.getMessage(CLOUD_EVENT_RECEIPT_STREAM, { last_by_subj: subject });
    if (!stored) return undefined;
    try {
      const parsed = receiptSchema.safeParse(JSON.parse(decoder.decode(stored.data)));
      if (!parsed.success) throw new Error('Durable cloud-event receipt failed closed-schema validation.');
      return parsed.data;
    } catch (error) {
      if (error instanceof Error && error.message.includes('closed-schema')) throw error;
      throw new Error('Durable cloud-event receipt is unreadable.');
    }
  }
}

export interface NatsCloudEventRuntime {
  connection: NatsConnection;
  manager: JetStreamManager;
  client: JetStreamClient;
  publisher: NatsCloudEventPublisher;
}

export async function connectNatsCloudEventRuntime(servers: string[], credentials: { user: string; pass: string }): Promise<NatsCloudEventRuntime> {
  if (servers.length < 1 || servers.some((server) => !/^nats:\/\/[a-zA-Z0-9.-]+:\d{2,5}$/.test(server))) throw new Error('NATS server list is invalid.');
  if (!credentials.user || !credentials.pass) throw new Error('NATS credentials are required.');
  const connection = await connect({ servers, user: credentials.user, pass: credentials.pass, name: 'enterprise-mcp-kit-cloud-events' });
  const manager = await jetstreamManager(connection);
  await ensureCloudEventTopology(manager);
  const client = jetstream(connection);
  return { connection, manager, client, publisher: new NatsCloudEventPublisher(client, new NatsCloudEventReceiptStore(manager, client)) };
}

export async function ensureCloudEventTopology(manager: JetStreamManager): Promise<void> {
  try {
    await manager.streams.info(CLOUD_EVENT_STREAM);
  } catch {
    await manager.streams.add({
      name: CLOUD_EVENT_STREAM,
      subjects: [CLOUD_EVENT_SUBJECT, DEAD_LETTER_SUBJECT],
      retention: RetentionPolicy.Workqueue,
      storage: StorageType.File,
      max_age: 86_400_000_000_000,
      max_msgs: 10_000,
      duplicate_window: 600_000_000_000,
      deny_delete: true,
      deny_purge: true,
    });
  }
  try {
    await manager.streams.info(CLOUD_EVENT_RECEIPT_STREAM);
  } catch {
    await manager.streams.add({
      name: CLOUD_EVENT_RECEIPT_STREAM,
      subjects: [`${CLOUD_EVENT_RECEIPT_SUBJECT_PREFIX}.*`],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      discard: DiscardPolicy.Old,
      max_age: 2_592_000_000_000_000,
      max_msgs: 10_000,
      max_msgs_per_subject: 1,
      allow_direct: true,
      deny_delete: true,
      deny_purge: true,
    });
  }
  try {
    await manager.consumers.info(CLOUD_EVENT_STREAM, CLOUD_EVENT_CONSUMER);
  } catch {
    await manager.consumers.add(CLOUD_EVENT_STREAM, {
      durable_name: CLOUD_EVENT_CONSUMER,
      filter_subject: CLOUD_EVENT_SUBJECT,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      ack_wait: 30_000_000_000,
      max_deliver: 3,
      max_ack_pending: 1,
    });
  }
}

export type CloudEventProcessOutcome = 'empty' | 'processed' | 'retrying' | 'dead-lettered';

export async function processNextCloudEvent(consumer: Pick<Consumer, 'next'>, handler: (event: CloudOperationalEvent) => Promise<void>): Promise<CloudEventProcessOutcome> {
  const message = await consumer.next({ expires: 1_000 });
  if (!message) return 'empty';
  const parsed = decodeMessage(message);
  if (!parsed) {
    message.term('invalid closed-schema event');
    return 'dead-lettered';
  }
  try {
    await handler(parsed);
    message.ack();
    return 'processed';
  } catch {
    if (message.info.deliveryCount >= 3) {
      message.term('bounded worker retries exhausted');
      return 'dead-lettered';
    }
    message.nak(1_000);
    return 'retrying';
  }
}

function decodeMessage(message: JsMsg): CloudOperationalEvent | undefined {
  try {
    const decoded: unknown = JSON.parse(decoder.decode(message.data));
    const parsed = cloudOperationalEventSchema.safeParse(decoded);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function encodeEvent(event: CloudOperationalEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event));
}

function receiptSubject(messageId: string): string { return `${CLOUD_EVENT_RECEIPT_SUBJECT_PREFIX}.${eventDigestKey(messageId)}`; }
function eventDigestKey(value: string): string { return createHash('sha256').update(value).digest('hex'); }
