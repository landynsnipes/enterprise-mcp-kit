import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveVerifiedOidcActor } from './governance-identity.js';
import { GovernanceAuthorizationError, GovernanceStateError, GovernanceValidationError, InMemoryActionGovernance, type ActionPlan, type GovernanceSnapshot } from './governance.js';
import { FileGovernanceStore } from './governance-storage.js';
import { OidcJwksVerifier } from './oidc-jwks.js';
import { NetBoxDeviceMetadataWriter } from './netbox-metadata-writer.js';
import { NetBoxSiteInformationWriter } from './netbox-site-writer.js';
import { planCustomerSiteProvisioning, type CustomerSiteManifest, type ProvisioningDiscovery } from './site-provisioning-manifest.js';
import { executeApprovedCustomerSiteProvisioning, type SiteProvisioningAdapter, type SiteProvisioningExecution } from './site-provisioning-executor.js';

type GovernanceTool = 'create_action_plan' | 'plan_customer_site_provisioning' | 'get_action_plan' | 'approve_action_plan' | 'reject_action_plan' | 'execute_action_plan' | 'rollback_action_plan';
export interface GovernanceGatewayOptions { verifier: OidcJwksVerifier; store: FileGovernanceStore; issuer: string; audience: string; writer?: NetBoxDeviceMetadataWriter; siteWriter?: NetBoxSiteInformationWriter; provisioningAdapter?: ProvisioningDiscovery & SiteProvisioningAdapter; now?: () => Date; }
export class GovernanceGateway {
  constructor(private readonly options: GovernanceGatewayOptions) {}
  async invoke(authorization: string | undefined, tool: GovernanceTool, input: unknown, idempotencyKey?: string): Promise<{ data: ActionPlan; meta: { requestId: string; tenantId: string; execution: 'disabled' | 'enabled'; replayed: boolean } }> {
    const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1]; if (!token) throw new GovernanceAuthorizationError('Bearer authentication is required.');
    const actor = resolveVerifiedOidcActor(await this.options.verifier.verify(token), { issuer: this.options.issuer, audience: this.options.audience }); const value = input as Record<string, unknown>; const mutating = tool !== 'get_action_plan';
    if (mutating && (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey))) throw new GovernanceValidationError('A valid Idempotency-Key is required for governance mutations.');
    const digest = createHash('sha256').update(JSON.stringify(canonical({ tool, input }))).digest('hex'); let replayed = false;
    const plan = await this.options.store.transact(async ({ receipts, ...stored }) => {
      const snapshot = { ...stored, version: 2 as const, receipts }; const prior = mutating ? receipts.find((item) => item.tenantId === actor.tenantId && item.actorId === actor.subjectId && item.key === idempotencyKey) : undefined;
      if (prior) { if (prior.operation !== tool || prior.requestDigest !== digest) throw new GovernanceStateError('Idempotency key was already used for a different request.'); const found = snapshot.plans.find((item) => item.id === prior.planId && item.tenantId === actor.tenantId); if (!found) throw new GovernanceStateError('Idempotency receipt references unavailable governance state.'); replayed = true; return { snapshot, result: found }; }
      const governance = new InMemoryActionGovernance(this.options.now); governance.restore(snapshot); let result: ActionPlan;
      if (tool === 'create_action_plan') result = governance.createPlan(actor, value as never);
      else if (tool === 'plan_customer_site_provisioning') {
        if (!this.options.provisioningAdapter) throw new GovernanceStateError('Customer-site provisioning is disabled.');
        const manifest=value.manifest as CustomerSiteManifest; const dry=await planCustomerSiteProvisioning(actor.tenantId,manifest,this.options.provisioningAdapter); if(!dry.executable)throw new GovernanceValidationError(`Customer-site manifest conflicts: ${dry.conflicts.join('; ')}`);
        result=governance.createPlan(actor,{actionType:'netbox.customer-site.provision',target:{kind:'netbox-site-manifest',id:manifest.site.slug},proposedChange:requireText(value.proposedChange),confidence:requireConfidence(value.confidence),evidence:[{source:'netbox-provisioning-dry-run',summary:`Digest ${dry.manifestDigest}; ${dry.orderedSteps.length} ordered records; no write executed.`}],ruleVersion:'customer-site-provisioning-v1',promptVersion:null,expiresAt:requireText(value.expiresAt),operation:null,provisioning:{manifest,manifestDigest:dry.manifestDigest}});
      }
      else if (tool === 'get_action_plan') result = governance.getPlan(actor, requireText(value.planId));
      else if (tool === 'approve_action_plan') result = governance.approvePlan(actor, requireText(value.planId), requireText(value.reason));
      else if (tool === 'reject_action_plan') result = governance.rejectPlan(actor, requireText(value.planId), requireText(value.reason));
      else {
        const planId = requireText(value.planId);
        if (tool === 'execute_action_plan') {
          const prepared = governance.prepareExecution(actor, planId);
          try {
            if(prepared.provisioning){if(!this.options.provisioningAdapter)throw new GovernanceStateError('Customer-site provisioning is disabled.');const execution=await executeApprovedCustomerSiteProvisioning({actorTenant:prepared.tenantId,approvedManifestDigest:prepared.provisioning.manifestDigest,manifest:prepared.provisioning.manifest},this.options.provisioningAdapter,this.options.provisioningAdapter);result=governance.completeProvisioningExecution(actor,planId,execution);}else{if(!this.options.writer||!this.options.siteWriter)throw new GovernanceStateError('Governance write execution is disabled.');const operation=prepared.operation!;const write=prepared.target.kind==='netbox-site'?await this.options.siteWriter.updateSiteInformation({...(operation as object),siteId:Number(prepared.target.id),tenantId:prepared.tenantId}as never):await this.options.writer.updateDeviceMetadata({...(operation as object),deviceId:Number(prepared.target.id),tenantId:prepared.tenantId}as never);result=governance.completeExecution(actor,planId,write);}
          } catch (error) {
            result = governance.failExecution(actor, planId, safeExecutionReason(error));
          }
        } else {
          const prepared = governance.prepareRollback(actor, planId); const prior = prepared.execution!;
          try {
            if(prepared.provisioning){if(!this.options.provisioningAdapter||!('created'in prior))throw new GovernanceStateError('Customer-site provisioning is disabled.');const compensated=[];const errors=[];for(const record of [...prior.created].reverse()){try{await this.options.provisioningAdapter.deleteCreated(record);compensated.push(record);}catch(error){errors.push(safeExecutionReason(error));}}const rollback:SiteProvisioningExecution={manifestDigest:prepared.provisioning.manifestDigest,state:compensated.length===prior.created.length?'compensated':'compensation_failed',created:prior.created.map(x=>({...x})),compensated,errors,boundary:'Rollback targeted only IDs recorded by the approved provisioning execution.'};result=governance.completeProvisioningRollback(actor,planId,rollback);}else{if(!this.options.writer||!this.options.siteWriter||!('field'in prior))throw new GovernanceStateError('Governance write execution is disabled.');const write = 'siteId' in prior
              ? await this.options.siteWriter.updateSiteInformation({ siteId: prior.siteId, tenantId: prepared.tenantId, field: prior.field, expectedValue: prior.afterValue, newValue: prior.beforeValue, expectedLastUpdated: prior.afterLastUpdated })
              : await this.options.writer.updateDeviceMetadata({ deviceId: prior.deviceId, tenantId: prepared.tenantId, field: prior.field, expectedValue: prior.afterValue, newValue: prior.beforeValue, expectedLastUpdated: prior.afterLastUpdated });
            result = governance.completeRollback(actor, planId, write);}
          } catch (error) {
            result = governance.failRollback(actor, planId, safeExecutionReason(error));
          }
        }
      }
      const next: GovernanceSnapshot = { ...governance.snapshot(), receipts: [...receipts] }; if (mutating) next.receipts.push({ key: idempotencyKey!, tenantId: actor.tenantId, actorId: actor.subjectId, operation: tool, requestDigest: digest, planId: result.id, recordedAt: (this.options.now ?? (() => new Date()))().toISOString() }); return { snapshot: next, result };
    });
    return { data: plan, meta: { requestId: randomUUID(), tenantId: actor.tenantId, execution: (this.options.writer && this.options.siteWriter)||this.options.provisioningAdapter ? 'enabled' : 'disabled', replayed } };
  }
}
function requireText(value: unknown): string { if (typeof value !== 'string' || !value || value.trim() !== value) throw new GovernanceValidationError('Request contains an invalid required field.'); return value; }
function requireConfidence(value:unknown):number{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new GovernanceValidationError('Request contains an invalid confidence.');return value;}
export function safeGatewayError(error: unknown): { error_code: string; message: string } { if (error instanceof GovernanceAuthorizationError) return { error_code: 'AUTHORIZATION_DENIED', message: error.message }; if (error instanceof GovernanceValidationError) return { error_code: 'VALIDATION_ERROR', message: error.message }; if (error instanceof GovernanceStateError) return { error_code: 'GOVERNANCE_STATE_ERROR', message: error.message }; return { error_code: 'GOVERNANCE_REQUEST_FAILED', message: 'Governance request failed.' }; }
export function createGovernanceHttpHandler(gateway: GovernanceGateway) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const requestId = typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : randomUUID(); const match = request.url?.match(/^\/api\/v1\/governance\/tools\/(create_action_plan|plan_customer_site_provisioning|get_action_plan|approve_action_plan|reject_action_plan|execute_action_plan|rollback_action_plan)$/);
    if (request.method !== 'POST' || !match) return send(response, 404, { error_code: 'NOT_FOUND', message: 'Route was not found.', request_id: requestId });
    try { const body = await readJson(request); const idempotencyKey = typeof request.headers['idempotency-key'] === 'string' ? request.headers['idempotency-key'] : undefined; const result = await gateway.invoke(request.headers.authorization, match[1] as Parameters<GovernanceGateway['invoke']>[1], body, idempotencyKey); send(response, 200, { data: result.data, meta: { ...result.meta, request_id: requestId }, errors: [] }); }
    catch (error) { const mapped = safeGatewayError(error); send(response, mapped.error_code === 'AUTHORIZATION_DENIED' ? 401 : mapped.error_code === 'VALIDATION_ERROR' ? 400 : 409, { ...mapped, request_id: requestId }); }
  };
}
async function readJson(request: IncomingMessage): Promise<unknown> { let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 65_536) throw new GovernanceValidationError('Request body exceeds the 64 KiB limit.'); } try { return JSON.parse(body); } catch { throw new GovernanceValidationError('Request body must be valid JSON.'); } }
function send(response: ServerResponse, status: number, body: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); }
function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])); return value; }
function safeExecutionReason(error: unknown): string { return error instanceof Error && error.message.length <= 240 ? error.message : 'Bounded NetBox write failed.'; }
