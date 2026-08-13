import { createServer } from 'node:http';
import { CloudEventMetrics } from './cloud-event-metrics.js';
import { CLOUD_EVENT_CONSUMER, CLOUD_EVENT_STREAM, connectNatsCloudEventRuntime, processNextCloudEvent } from './nats-cloud-event-queue.js';
import { parseCloudEventServiceConfig } from './cloud-event-service-config.js';
import { logEvent, writeWebResponse } from './cloud-event-service-utils.js';

const config = parseCloudEventServiceConfig(process.env, 8791); const metrics = new CloudEventMetrics();
const runtime = await connectNatsCloudEventRuntime(config.natsServers, { user: config.natsUser, pass: config.natsPassword });
const consumer = await runtime.client.consumers.get(CLOUD_EVENT_STREAM, CLOUD_EVENT_CONSUMER); let running = true; let ready = true;
const server = createServer(async (request, response) => {
  if (request.url === '/healthz') return void writeWebResponse(response, Response.json({ status: 'healthy' }));
  if (request.url === '/readyz') return void writeWebResponse(response, Response.json({ status: ready ? 'ready' : 'not-ready' }, { status: ready ? 200 : 503 }));
  if (request.url === '/metrics') { try { const info = await runtime.manager.streams.info(CLOUD_EVENT_STREAM); metrics.setQueueDepth(Math.min(info.state.messages, 10_000)); return void writeWebResponse(response, new Response(metrics.renderPrometheus(), { headers: { 'content-type': 'text/plain; version=0.0.4' } })); } catch { return void writeWebResponse(response, Response.json({ status: 'dependency-unavailable' }, { status: 503 })); } }
  return void writeWebResponse(response, Response.json({ error: 'not-found' }, { status: 404 }));
});
server.listen(config.port, config.host, () => logEvent('info', 'service.started', { host: config.host, port: config.port }));
const shutdown = async () => { running = false; ready = false; server.close(); await runtime.connection.drain(); process.exit(0); }; process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
while (running) {
  try { const outcome = await processNextCloudEvent(consumer, async (event) => { logEvent('info', 'event.evidence_recorded', { eventId: event.eventId, tenantId: event.tenantId, correlationId: event.correlationId, decisionTraceId: event.decisionTraceId, source: event.source, type: event.type }); }); if (outcome !== 'empty') metrics.record(outcome === 'dead-lettered' ? 'dead_lettered' : outcome); }
  catch (error) { metrics.record('retrying'); ready = false; logEvent('error', 'worker.poll_failed', { reason: error instanceof Error ? error.message.slice(0, 160) : 'unknown' }); await new Promise((resolve) => setTimeout(resolve, 1_000)); ready = true; }
}
