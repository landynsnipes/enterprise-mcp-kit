import { createServer } from 'node:http';
import { CloudEventAuthorizationError, type CloudEventActor } from './cloud-event-ingestion.js';
import { createCloudEventHttpHandler } from './cloud-event-http.js';
import { CloudEventMetrics } from './cloud-event-metrics.js';
import { connectNatsCloudEventRuntime } from './nats-cloud-event-queue.js';
import { parseCloudEventServiceConfig } from './cloud-event-service-config.js';
import { logEvent, toWebRequest, writeWebResponse } from './cloud-event-service-utils.js';
import { OidcJwksVerifier } from './oidc-jwks.js';

const config = parseCloudEventServiceConfig(process.env, 8790);
const runtime = await connectNatsCloudEventRuntime(config.natsServers, { user: config.natsUser, pass: config.natsPassword });
const verifier = new OidcJwksVerifier({ issuer: config.oidcIssuer, audience: config.oidcAudience, jwksUrl: config.oidcJwksUrl, allowInsecureLoopback: true, allowedInsecureJwksHosts: config.allowedInsecureJwksHosts });
const metrics = new CloudEventMetrics();
const authenticate = async (authorization: string | null): Promise<CloudEventActor> => {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/); if (!match) throw new CloudEventAuthorizationError('Bearer authentication is required.');
  try {
    const claims = await verifier.verify(match[1]);
    if (typeof claims.sub !== 'string' || typeof claims.tenant_id !== 'string' || !Array.isArray(claims.roles) || !claims.roles.includes('cloud-event-ingestor')) throw new CloudEventAuthorizationError('Actor lacks the admitted cloud event ingestion role.');
    return { subjectId: claims.sub, tenantId: claims.tenant_id, roles: ['cloud-event-ingestor'] };
  } catch { throw new CloudEventAuthorizationError('Bearer token is not authorized for cloud event ingestion.'); }
};
const ingest = createCloudEventHttpHandler({ queue: runtime.publisher, authenticate });
let ready = true;
const server = createServer(async (request, response) => {
  const started = performance.now();
  try {
    if (request.url === '/healthz') return void writeWebResponse(response, Response.json({ status: 'healthy' }));
    if (request.url === '/readyz') { try { await runtime.manager.getAccountInfo(); ready = true; } catch { ready = false; } return void writeWebResponse(response, Response.json({ status: ready ? 'ready' : 'not-ready' }, { status: ready ? 200 : 503 })); }
    if (request.url === '/metrics') return void writeWebResponse(response, new Response(metrics.renderPrometheus(), { headers: { 'content-type': 'text/plain; version=0.0.4' } }));
    const webResponse = await ingest(await toWebRequest(request));
    if (webResponse.status === 202) { const payload = await webResponse.clone().json() as { meta?: { replayed?: boolean } }; metrics.record(payload.meta?.replayed ? 'replayed' : 'accepted'); } else metrics.record('rejected');
    await writeWebResponse(response, webResponse);
    const durationMs = performance.now() - started; metrics.observeRequestDuration(durationMs);
    logEvent('info', 'request.completed', { requestId: webResponse.headers.get('x-request-id'), status: webResponse.status, durationMs: Math.round(durationMs) });
  } catch (error) { metrics.record('rejected'); logEvent('error', 'request.failed', { reason: error instanceof Error ? error.message.slice(0, 160) : 'unknown' }); await writeWebResponse(response, Response.json({ data: null, meta: {}, errors: [{ code: 'CLOUD_EVENT_INTERNAL', message: 'Request failed safely.' }] }, { status: 500 })); }
});
server.listen(config.port, config.host, () => logEvent('info', 'service.started', { host: config.host, port: config.port }));
const shutdown = async () => { ready = false; server.close(); await runtime.connection.drain(); process.exit(0); }; process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
