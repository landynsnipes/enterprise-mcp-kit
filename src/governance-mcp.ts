import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GovernanceAuthorizationError, GovernanceStateError, GovernanceValidationError, type GovernanceActor, type InMemoryActionGovernance } from './governance.js';

export interface TrustedActorProvider { getActor(): GovernanceActor; }
const exact = z.string().min(1).refine((value) => value.trim() === value, 'Must be a non-empty exact string.');
const reconciliationStatus = z.enum(['matched', 'drifted', 'missing-observation', 'exception', 'not-evaluated']);
const operation = z.object({ field: z.literal('reconciliation_status'), expectedValue: reconciliationStatus.nullable(), newValue: reconciliationStatus, expectedLastUpdated: z.string().datetime() }).strict();
const planInput = z.object({ actionType: exact, target: z.object({ kind: exact, id: exact }).strict(), proposedChange: exact, confidence: z.number().min(0).max(1), evidence: z.array(z.object({ source: exact, summary: exact }).strict()).min(1).max(20), ruleVersion: exact, promptVersion: exact.nullable(), expiresAt: z.string().datetime(), operation: operation.nullable().optional() }).strict();
const writeResult = z.object({ deviceId: z.number().int().positive(), deviceName: z.string(), tenantId: z.string(), field: z.literal('reconciliation_status'), beforeValue: reconciliationStatus.nullable(), afterValue: reconciliationStatus.nullable(), beforeLastUpdated: z.string(), afterLastUpdated: z.string(), source: z.string() }).strict();
const execution = writeResult.extend({ executedBy: z.string(), executedAt: z.string() }).strict(); const rollback = writeResult.extend({ rolledBackBy: z.string(), rolledBackAt: z.string() }).strict();
const planOutput = z.object({ id: z.string(), tenantId: z.string(), initiatedBy: z.string(), state: z.enum(['planned', 'approved', 'rejected', 'expired', 'executing', 'executed', 'execution_failed', 'rolling_back', 'rolled_back', 'rollback_failed']), createdAt: z.string(), approvedBy: z.string().nullable(), approvedAt: z.string().nullable(), approvalReason: z.string().nullable(), actionType: z.string(), target: z.object({ kind: z.string(), id: z.string() }).strict(), proposedChange: z.string(), confidence: z.number(), evidence: z.array(z.object({ source: z.string(), summary: z.string() }).strict()), ruleVersion: z.string(), promptVersion: z.string().nullable(), expiresAt: z.string(), operation: operation.nullable(), execution: execution.nullable(), rollback: rollback.nullable() }).strict();
const planIdInput = z.object({ planId: exact }).strict();
const decisionInput = z.object({ planId: exact, reason: exact }).strict();
function safe(error: unknown): string { return error instanceof GovernanceValidationError || error instanceof GovernanceAuthorizationError || error instanceof GovernanceStateError ? error.message : 'Governance request failed.'; }

/**
 * Deliberately separate from the unauthenticated stdio NetBox server. The actor
 * is injected by a transport that has already authenticated the caller.
 */
export function createGovernanceMcpServer(governance: InMemoryActionGovernance, actors: TrustedActorProvider): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit-governance', version: '0.1.0' });
  const respond = (fn: () => unknown) => { try { const result = fn(); return { content: [{ type: 'text' as const, text: 'Governance state recorded; no external action was executed.' }], structuredContent: planOutput.parse(result) }; } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; } };
  server.registerTool('create_action_plan', { description: 'Create a tenant-scoped, evidence-backed, dry-run action plan. It never executes an external action.', inputSchema: planInput, outputSchema: planOutput }, (input) => respond(() => governance.createPlan(actors.getActor(), input)));
  server.registerTool('get_action_plan', { description: 'Read one tenant-scoped action plan. It never executes an external action.', inputSchema: planIdInput, outputSchema: planOutput }, (input) => respond(() => governance.getPlan(actors.getActor(), input.planId)));
  server.registerTool('approve_action_plan', { description: 'Record a human approval for one unexpired action plan. It never executes an external action.', inputSchema: decisionInput, outputSchema: planOutput }, (input) => respond(() => governance.approvePlan(actors.getActor(), input.planId, input.reason)));
  server.registerTool('reject_action_plan', { description: 'Record a human rejection for one unexpired action plan. It never executes an external action.', inputSchema: decisionInput, outputSchema: planOutput }, (input) => respond(() => governance.rejectPlan(actors.getActor(), input.planId, input.reason)));
  return server;
}
