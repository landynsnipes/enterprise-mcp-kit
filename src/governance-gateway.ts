import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveVerifiedOidcActor } from './governance-identity.js';
import { GovernanceAuthorizationError, GovernanceStateError, GovernanceValidationError, InMemoryActionGovernance, type ActionPlan } from './governance.js';
import { FileGovernanceStore } from './governance-storage.js';
import { OidcJwksVerifier } from './oidc-jwks.js';

export interface GovernanceGatewayOptions { verifier: OidcJwksVerifier; store: FileGovernanceStore; issuer: string; audience: string; now?: () => Date; }
export class GovernanceGateway {
  constructor(private readonly options: GovernanceGatewayOptions) {}
  async invoke(authorization: string | undefined, tool: 'create_action_plan' | 'get_action_plan' | 'approve_action_plan' | 'reject_action_plan', input: unknown): Promise<{ data: ActionPlan; meta: { requestId: string; tenantId: string; execution: 'disabled' } }> {
    const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1]; if (!token) throw new GovernanceAuthorizationError('Bearer authentication is required.');
    const actor = resolveVerifiedOidcActor(await this.options.verifier.verify(token), { issuer: this.options.issuer, audience: this.options.audience }); const governance = new InMemoryActionGovernance(this.options.now); governance.restore(await this.options.store.load());
    const value = input as Record<string, unknown>; let plan: ActionPlan;
    if (tool === 'create_action_plan') plan = governance.createPlan(actor, value as never);
    else if (tool === 'get_action_plan') plan = governance.getPlan(actor, requireText(value.planId));
    else if (tool === 'approve_action_plan') plan = governance.approvePlan(actor, requireText(value.planId), requireText(value.reason));
    else plan = governance.rejectPlan(actor, requireText(value.planId), requireText(value.reason));
    await this.options.store.save(governance.snapshot()); return { data: plan, meta: { requestId: randomUUID(), tenantId: actor.tenantId, execution: 'disabled' } };
  }
}
function requireText(value: unknown): string { if (typeof value !== 'string' || !value || value.trim() !== value) throw new GovernanceValidationError('Request contains an invalid required field.'); return value; }
export function safeGatewayError(error: unknown): { error_code: string; message: string } { if (error instanceof GovernanceAuthorizationError) return { error_code: 'AUTHORIZATION_DENIED', message: error.message }; if (error instanceof GovernanceValidationError) return { error_code: 'VALIDATION_ERROR', message: error.message }; if (error instanceof GovernanceStateError) return { error_code: 'GOVERNANCE_STATE_ERROR', message: error.message }; return { error_code: 'GOVERNANCE_REQUEST_FAILED', message: 'Governance request failed.' }; }
export function createGovernanceHttpHandler(gateway: GovernanceGateway) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const requestId = typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : randomUUID(); const match = request.url?.match(/^\/api\/v1\/governance\/tools\/(create_action_plan|get_action_plan|approve_action_plan|reject_action_plan)$/);
    if (request.method !== 'POST' || !match) return send(response, 404, { error_code: 'NOT_FOUND', message: 'Route was not found.', request_id: requestId });
    try { const body = await readJson(request); const result = await gateway.invoke(request.headers.authorization, match[1] as Parameters<GovernanceGateway['invoke']>[1], body); send(response, 200, { data: result.data, meta: { ...result.meta, request_id: requestId }, errors: [] }); }
    catch (error) { const mapped = safeGatewayError(error); send(response, mapped.error_code === 'AUTHORIZATION_DENIED' ? 401 : mapped.error_code === 'VALIDATION_ERROR' ? 400 : 409, { ...mapped, request_id: requestId }); }
  };
}
async function readJson(request: IncomingMessage): Promise<unknown> { let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 65_536) throw new GovernanceValidationError('Request body exceeds the 64 KiB limit.'); } try { return JSON.parse(body); } catch { throw new GovernanceValidationError('Request body must be valid JSON.'); } }
function send(response: ServerResponse, status: number, body: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); }
