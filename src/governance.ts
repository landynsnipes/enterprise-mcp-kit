import { randomUUID } from 'node:crypto';
import { requireCapability } from './governance-capabilities.js';
import type { DeviceMetadataChange, DeviceMetadataWriteResult } from './netbox-metadata-writer.js';

export type PlanState = 'planned' | 'approved' | 'rejected' | 'expired' | 'executing' | 'executed' | 'execution_failed' | 'rolling_back' | 'rolled_back' | 'rollback_failed';

export interface GovernanceActor {
  subjectId: string;
  tenantId: string;
  roles: string[];
}

export interface PlanEvidence {
  source: string;
  summary: string;
}

export interface CreateActionPlan {
  actionType: string;
  target: { kind: string; id: string };
  proposedChange: string;
  confidence: number;
  evidence: PlanEvidence[];
  ruleVersion: string;
  promptVersion: string | null;
  expiresAt: string;
  operation?: DeviceMetadataChange | null;
}

export interface GovernanceAuditEvent {
  id: string;
  planId: string;
  tenantId: string;
  event: 'plan_created' | 'plan_approved' | 'plan_rejected' | 'plan_expired' | 'execution_started' | 'execution_succeeded' | 'execution_failed' | 'rollback_started' | 'rollback_succeeded' | 'rollback_failed';
  actorId: string;
  occurredAt: string;
  reason: string | null;
}

export interface ActionPlan extends CreateActionPlan {
  id: string;
  tenantId: string;
  initiatedBy: string;
  state: PlanState;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  operation: DeviceMetadataChange | null;
  execution: (DeviceMetadataWriteResult & { executedBy: string; executedAt: string }) | null;
  rollback: (DeviceMetadataWriteResult & { rolledBackBy: string; rolledBackAt: string }) | null;
}
export interface GovernanceOperationReceipt { key: string; tenantId: string; actorId: string; operation: string; requestDigest: string; planId: string; recordedAt: string; }
export interface GovernanceSnapshot { version: 2; plans: ActionPlan[]; events: GovernanceAuditEvent[]; receipts: GovernanceOperationReceipt[]; }

export class GovernanceValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'GovernanceValidationError'; }
}
export class GovernanceAuthorizationError extends Error {
  constructor(message: string) { super(message); this.name = 'GovernanceAuthorizationError'; }
}
export class GovernanceStateError extends Error {
  constructor(message: string) { super(message); this.name = 'GovernanceStateError'; }
}

export class InMemoryActionGovernance {
  private readonly plans = new Map<string, ActionPlan>();
  private readonly events: GovernanceAuditEvent[] = [];

  constructor(private readonly now: () => Date = () => new Date(), private readonly newId: () => string = randomUUID) {}

  snapshot(): GovernanceSnapshot { return { version: 2, plans: [...this.plans.values()].map(copyPlan), events: this.events.map((event) => ({ ...event })), receipts: [] }; }
  restore(snapshot: GovernanceSnapshot): void {
    if (!snapshot || snapshot.version !== 2 || !Array.isArray(snapshot.plans) || !Array.isArray(snapshot.events)) throw new GovernanceValidationError('Governance snapshot is invalid.');
    this.plans.clear(); this.events.length = 0;
    for (const plan of snapshot.plans) { this.validateStoredPlan(plan); this.plans.set(plan.id, copyPlan(plan)); }
    for (const event of snapshot.events) { if (!isExactText(event.id) || !isExactText(event.planId) || !isExactText(event.tenantId) || !isExactText(event.actorId) || !isExactText(event.occurredAt)) throw new GovernanceValidationError('Governance audit event is invalid.'); this.events.push({ ...event }); }
  }

  createPlan(actor: GovernanceActor, input: CreateActionPlan): ActionPlan {
    requireCapability(actor, 'plan:create');
    this.validateInput(input);
    const createdAt = this.now().toISOString();
    const plan: ActionPlan = { ...input, operation: input.operation ?? null, id: this.newId(), tenantId: actor.tenantId, initiatedBy: actor.subjectId, state: 'planned', createdAt, approvedBy: null, approvedAt: null, approvalReason: null, execution: null, rollback: null };
    this.plans.set(plan.id, plan);
    this.record(plan, 'plan_created', actor.subjectId, null);
    return { ...plan, evidence: [...plan.evidence] };
  }

  approvePlan(actor: GovernanceActor, planId: string, reason: string): ActionPlan {
    requireCapability(actor, 'plan:approve');
    const plan = this.getOwnedPlan(actor, planId);
    if (plan.initiatedBy === actor.subjectId) throw new GovernanceAuthorizationError('Plan initiators cannot approve their own plans.');
    this.expireIfNeeded(plan);
    if (plan.state !== 'planned') throw new GovernanceStateError(`Action plan cannot be approved from state ${plan.state}.`);
    if (!isExactText(reason)) throw new GovernanceValidationError('Approval reason must be a non-empty, non-padded string.');
    plan.state = 'approved'; plan.approvedBy = actor.subjectId; plan.approvedAt = this.now().toISOString(); plan.approvalReason = reason;
    this.record(plan, 'plan_approved', actor.subjectId, reason);
    return { ...plan, evidence: [...plan.evidence] };
  }

  rejectPlan(actor: GovernanceActor, planId: string, reason: string): ActionPlan {
    requireCapability(actor, 'plan:reject');
    const plan = this.getOwnedPlan(actor, planId);
    if (plan.initiatedBy === actor.subjectId) throw new GovernanceAuthorizationError('Plan initiators cannot reject their own plans.');
    this.expireIfNeeded(plan);
    if (plan.state !== 'planned') throw new GovernanceStateError(`Action plan cannot be rejected from state ${plan.state}.`);
    if (!isExactText(reason)) throw new GovernanceValidationError('Rejection reason must be a non-empty, non-padded string.');
    plan.state = 'rejected';
    this.record(plan, 'plan_rejected', actor.subjectId, reason);
    return { ...plan, evidence: [...plan.evidence] };
  }

  prepareExecution(actor: GovernanceActor, planId: string): ActionPlan {
    requireCapability(actor, 'plan:execute'); const plan = this.getOwnedPlan(actor, planId);
    if (plan.initiatedBy === actor.subjectId || plan.approvedBy === actor.subjectId) throw new GovernanceAuthorizationError('Plan initiators and approvers cannot execute the same plan.');
    if (new Date(plan.expiresAt).getTime() <= this.now().getTime()) { plan.state = 'expired'; this.record(plan, 'plan_expired', 'system', null); throw new GovernanceStateError('Action plan expired before execution.'); }
    if (plan.state !== 'approved') throw new GovernanceStateError(`Action plan cannot be executed from state ${plan.state}.`);
    const admittedAction = plan.operation?.field === 'reconciliation_status' ? 'netbox.device.metadata.update' : 'netbox.device.software-version.update';
    if (plan.actionType !== admittedAction || plan.target.kind !== 'netbox-device' || !/^\d+$/.test(plan.target.id) || !plan.operation) throw new GovernanceValidationError('Action plan does not contain an admitted executable operation.');
    validateOperation(plan.operation); plan.state = 'executing'; this.record(plan, 'execution_started', actor.subjectId, null); return copyPlan(plan);
  }
  completeExecution(actor: GovernanceActor, planId: string, result: DeviceMetadataWriteResult): ActionPlan {
    const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'executing' || !plan.operation || Number(plan.target.id) !== result.deviceId || plan.tenantId !== result.tenantId || result.field !== plan.operation.field || result.beforeValue !== plan.operation.expectedValue || result.afterValue !== plan.operation.newValue || result.beforeLastUpdated !== plan.operation.expectedLastUpdated) throw new GovernanceStateError('Execution result does not match the prepared plan.');
    plan.execution = { ...result, executedBy: actor.subjectId, executedAt: this.now().toISOString() }; plan.state = 'executed'; this.record(plan, 'execution_succeeded', actor.subjectId, null); return copyPlan(plan);
  }
  failExecution(actor: GovernanceActor, planId: string, reason: string): ActionPlan { const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'executing') throw new GovernanceStateError('Action plan is not executing.'); plan.state = 'execution_failed'; this.record(plan, 'execution_failed', actor.subjectId, reason); return copyPlan(plan); }
  prepareRollback(actor: GovernanceActor, planId: string): ActionPlan {
    requireCapability(actor, 'plan:execute'); const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'executed' || !plan.execution || !plan.operation) throw new GovernanceStateError(`Action plan cannot be rolled back from state ${plan.state}.`); plan.state = 'rolling_back'; this.record(plan, 'rollback_started', actor.subjectId, null); return copyPlan(plan);
  }
  completeRollback(actor: GovernanceActor, planId: string, result: DeviceMetadataWriteResult): ActionPlan { const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'rolling_back' || !plan.execution || result.deviceId !== plan.execution.deviceId || result.tenantId !== plan.tenantId || result.field !== plan.execution.field || result.beforeValue !== plan.execution.afterValue || result.afterValue !== plan.execution.beforeValue || result.beforeLastUpdated !== plan.execution.afterLastUpdated) throw new GovernanceStateError('Rollback result does not restore the recorded prior value.'); plan.rollback = { ...result, rolledBackBy: actor.subjectId, rolledBackAt: this.now().toISOString() }; plan.state = 'rolled_back'; this.record(plan, 'rollback_succeeded', actor.subjectId, null); return copyPlan(plan); }
  failRollback(actor: GovernanceActor, planId: string, reason: string): ActionPlan { const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'rolling_back') throw new GovernanceStateError('Action plan is not rolling back.'); plan.state = 'rollback_failed'; this.record(plan, 'rollback_failed', actor.subjectId, reason); return copyPlan(plan); }

  getPlan(actor: GovernanceActor, planId: string): ActionPlan {
    requireCapability(actor, 'plan:read');
    const plan = this.getOwnedPlan(actor, planId); this.expireIfNeeded(plan); return { ...plan, evidence: [...plan.evidence] };
  }
  listAuditEvents(actor: GovernanceActor, planId: string): GovernanceAuditEvent[] {
    requireCapability(actor, 'audit:read');
    this.getOwnedPlan(actor, planId);
    return this.events.filter((event) => event.planId === planId).map((event) => ({ ...event }));
  }

  private getOwnedPlan(actor: GovernanceActor, planId: string): ActionPlan {
    if (!isExactText(planId)) throw new GovernanceValidationError('Action plan ID must be a non-empty, non-padded string.');
    const plan = this.plans.get(planId); if (!plan) throw new GovernanceStateError('Action plan was not found.');
    if (plan.tenantId !== actor.tenantId) throw new GovernanceAuthorizationError('Action plan is outside the actor tenant scope.');
    return plan;
  }
  private expireIfNeeded(plan: ActionPlan): void {
    if (plan.state !== 'planned' || new Date(plan.expiresAt).getTime() > this.now().getTime()) return;
    plan.state = 'expired'; this.record(plan, 'plan_expired', 'system', null);
  }
  private record(plan: ActionPlan, event: GovernanceAuditEvent['event'], actorId: string, reason: string | null): void {
    this.events.push({ id: this.newId(), planId: plan.id, tenantId: plan.tenantId, event, actorId, occurredAt: this.now().toISOString(), reason });
  }
  private validateInput(input: CreateActionPlan, requireCurrentWindow = true): void {
    const expires = new Date(input?.expiresAt).getTime(); const now = this.now().getTime();
    if (!input || !isExactText(input.actionType) || !isExactText(input.target?.kind) || !isExactText(input.target?.id) || !isExactText(input.proposedChange) || !isExactText(input.ruleVersion) || !Array.isArray(input.evidence) || input.evidence.length === 0 || input.evidence.length > 20 || !input.evidence.every((item) => isExactText(item.source) && isExactText(item.summary)) || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1 || (input.promptVersion !== null && !isExactText(input.promptVersion)) || Number.isNaN(expires) || (requireCurrentWindow && (expires <= now || expires > now + 86_400_000))) throw new GovernanceValidationError('Action plan contains invalid, expired, or excessively long-lived governance metadata.');
    if (input.operation !== undefined && input.operation !== null) validateOperation(input.operation);
  }
  private validateStoredPlan(plan: ActionPlan): void { this.validateInput(plan, false); if (!isExactText(plan.id) || !isExactText(plan.tenantId) || !isExactText(plan.initiatedBy) || !isExactText(plan.createdAt) || !['planned', 'approved', 'rejected', 'expired', 'executing', 'executed', 'execution_failed', 'rolling_back', 'rolled_back', 'rollback_failed'].includes(plan.state)) throw new GovernanceValidationError('Governance plan snapshot is invalid.'); plan.operation ??= null; plan.execution ??= null; plan.rollback ??= null; }
}

function isExactText(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function copyPlan(plan: ActionPlan): ActionPlan { return { ...plan, evidence: plan.evidence.map((item) => ({ ...item })), target: { ...plan.target }, operation: plan.operation ? { ...plan.operation } : null, execution: plan.execution ? { ...plan.execution } : null, rollback: plan.rollback ? { ...plan.rollback } : null }; }
function validateOperation(operation: DeviceMetadataChange): void { const statuses = ['matched', 'drifted', 'missing-observation', 'exception', 'not-evaluated']; const version = (value: unknown) => value === null || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+:-]{0,63}$/.test(value)); const valid = operation?.field === 'reconciliation_status' ? (operation.expectedValue === null || statuses.includes(String(operation.expectedValue))) && (operation.newValue !== null && statuses.includes(String(operation.newValue))) : ['observed_software_version', 'minimum_approved_version'].includes(operation?.field) && version(operation.expectedValue) && version(operation.newValue); if (!operation || !valid || operation.expectedValue === operation.newValue || !isExactText(operation.expectedLastUpdated) || Number.isNaN(Date.parse(operation.expectedLastUpdated))) throw new GovernanceValidationError('Device metadata operation is invalid.'); }
