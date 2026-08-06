import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { customerSiteManifestSchema, governancePlanInputSchema, governancePlanOutputSchema } from './governance-mcp.js';
import { safeGatewayError, type GovernanceGateway, type GovernanceGatewayData, type GovernanceTool } from './governance-gateway.js';

const exact=z.string().min(1).max(240).refine(value=>value.trim()===value);
const idempotencyKey=z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);
const planId=z.object({planId:exact}).strict();
const mutationPlanId=planId.extend({idempotencyKey}).strict();
const decision=mutationPlanId.extend({reason:exact}).strict();
const auditEvent=z.object({id:z.string(),planId:z.string(),tenantId:z.string(),event:z.enum(['plan_created','plan_approved','plan_rejected','plan_expired','execution_started','execution_succeeded','execution_failed','rollback_started','rollback_succeeded','rollback_failed']),actorId:z.string(),occurredAt:z.string(),reason:z.string().nullable()}).strict();
const auditOutput=z.object({planId:z.string(),tenantId:z.string(),events:z.array(auditEvent).max(100),boundary:z.string()}).strict();
const provisioningInput=z.object({manifest:customerSiteManifestSchema,proposedChange:exact,confidence:z.number().min(0).max(1),expiresAt:z.string().datetime(),idempotencyKey}).strict();
const createInput=governancePlanInputSchema.extend({idempotencyKey}).strict();

export function createGovernanceRemoteMcpServer(gateway:GovernanceGateway,authorization:string):McpServer{
  const server=new McpServer({name:'enterprise-mcp-kit-governance-remote',version:'0.1.0'});
  const run=async(tool:GovernanceTool,input:Record<string,unknown>,key?:string)=>{try{const result=await gateway.invoke(authorization,tool,input,key);return response(result.data,tool);}catch(error){const safe=safeGatewayError(error);return{content:[{type:'text'as const,text:safe.message}],isError:true};}};
  server.registerTool('create_action_plan',{description:'Create a tenant-scoped evidence-backed plan. This tool never executes an external action.',inputSchema:createInput,outputSchema:governancePlanOutputSchema},input=>run('create_action_plan',withoutKey(input),input.idempotencyKey));
  server.registerTool('plan_customer_site_provisioning',{description:'Validate one bounded tenant-scoped customer-site manifest and record its immutable dry-run digest. This tool performs no writes.',inputSchema:provisioningInput,outputSchema:governancePlanOutputSchema},input=>run('plan_customer_site_provisioning',withoutKey(input),input.idempotencyKey));
  server.registerTool('get_action_plan',{description:'Read one action plan within the authenticated tenant.',inputSchema:planId,outputSchema:governancePlanOutputSchema},input=>run('get_action_plan',input));
  server.registerTool('list_audit_events',{description:'Read the bounded lifecycle audit history for one tenant-scoped action plan.',inputSchema:planId,outputSchema:auditOutput},input=>run('list_audit_events',input));
  server.registerTool('approve_action_plan',{description:'Record explicit human approval for an unexpired plan. Approval does not execute it.',inputSchema:decision,outputSchema:governancePlanOutputSchema},input=>run('approve_action_plan',withoutKey(input),input.idempotencyKey));
  server.registerTool('reject_action_plan',{description:'Record explicit human rejection for an unexpired plan.',inputSchema:decision,outputSchema:governancePlanOutputSchema},input=>run('reject_action_plan',withoutKey(input),input.idempotencyKey));
  server.registerTool('execute_action_plan',{description:'Execute exactly one approved plan using the separately configured bounded credential and record the outcome.',inputSchema:mutationPlanId,outputSchema:governancePlanOutputSchema},input=>run('execute_action_plan',withoutKey(input),input.idempotencyKey));
  server.registerTool('rollback_action_plan',{description:'Roll back only the exact prior values or created IDs recorded by an executed plan.',inputSchema:mutationPlanId,outputSchema:governancePlanOutputSchema},input=>run('rollback_action_plan',withoutKey(input),input.idempotencyKey));
  return server;
}
function withoutKey<T extends Record<string,unknown>>(input:T):Record<string,unknown>{const{idempotencyKey:_,...rest}=input;return rest;}
function response(data:GovernanceGatewayData,tool:GovernanceTool){const audit=tool==='list_audit_events';const structuredContent=audit?auditOutput.parse(data):governancePlanOutputSchema.parse(data);return{content:[{type:'text'as const,text:audit?'Tenant-scoped governance audit history returned.':tool==='execute_action_plan'||tool==='rollback_action_plan'?'Governed external action lifecycle updated.':'Governance state recorded; no external action was executed.'}],structuredContent};}
