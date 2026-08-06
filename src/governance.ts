import { randomUUID } from 'node:crypto';
import { requireCapability } from './governance-capabilities.js';
import type { DeviceMetadataChange, DeviceMetadataWriteResult } from './netbox-metadata-writer.js';
import type { SiteInformationChange, SiteInformationWriteResult } from './netbox-site-writer.js';
import type { CustomerSiteManifest } from './site-provisioning-manifest.js';
import type { SiteProvisioningExecution } from './site-provisioning-executor.js';
import { inventoryIntentActions, type InventoryIntent, type InventoryIntentWriteResult } from './netbox-inventory-intent-writer.js';
type GovernedChange = DeviceMetadataChange | SiteInformationChange | InventoryIntent; type GovernedWriteResult = DeviceMetadataWriteResult | SiteInformationWriteResult | InventoryIntentWriteResult;
export interface GovernedSiteProvisioning { manifest: CustomerSiteManifest; manifestDigest: string; }

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
  operation?: GovernedChange | null;
  provisioning?: GovernedSiteProvisioning | null;
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
  operation: GovernedChange | null;
  provisioning: GovernedSiteProvisioning | null;
  execution: ((GovernedWriteResult | SiteProvisioningExecution) & { executedBy: string; executedAt: string }) | null;
  rollback: ((GovernedWriteResult | SiteProvisioningExecution) & { rolledBackBy: string; rolledBackAt: string }) | null;
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
    const plan: ActionPlan = { ...input, operation: input.operation ?? null, provisioning: input.provisioning ?? null, id: this.newId(), tenantId: actor.tenantId, initiatedBy: actor.subjectId, state: 'planned', createdAt, approvedBy: null, approvedAt: null, approvalReason: null, execution: null, rollback: null };
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
    if (plan.provisioning) {
      if (plan.actionType !== 'netbox.customer-site.provision' || plan.target.kind !== 'netbox-site-manifest' || plan.target.id !== plan.provisioning.manifest.site.slug || plan.operation || plan.provisioning.manifest.tenantSlug !== plan.tenantId || !/^[a-f0-9]{64}$/.test(plan.provisioning.manifestDigest)) throw new GovernanceValidationError('Action plan does not contain an admitted provisioning operation.');
    } else if (plan.operation && isInventoryIntent(plan.operation)) {
      const operation = plan.operation;
      if (plan.actionType !== `netbox.${operation.action}` || plan.target.kind !== operation.targetKind || plan.target.id !== String(operation.targetId) || operation.tenantId !== plan.tenantId) throw new GovernanceValidationError('Action plan does not contain an admitted executable inventory intent.');
      validateOperation(operation);
    } else {
      const site = plan.target.kind === 'netbox-site'; const admittedAction = site ? 'netbox.site.information.update' : plan.operation?.field === 'reconciliation_status' ? 'netbox.device.metadata.update' : 'netbox.device.software-version.update';
      if (plan.actionType !== admittedAction || !['netbox-device', 'netbox-site'].includes(plan.target.kind) || !/^\d+$/.test(plan.target.id) || !plan.operation || (site !== isSiteChange(plan.operation))) throw new GovernanceValidationError('Action plan does not contain an admitted executable operation.');
      validateOperation(plan.operation);
    }
    plan.state = 'executing'; this.record(plan, 'execution_started', actor.subjectId, null); return copyPlan(plan);
  }
  completeExecution(actor: GovernanceActor, planId: string, result: DeviceMetadataWriteResult | SiteInformationWriteResult): ActionPlan {
    const plan = this.getOwnedPlan(actor, planId); const resultId = 'deviceId' in result ? result.deviceId : result.siteId; if (plan.state !== 'executing' || !plan.operation || isInventoryIntent(plan.operation) || Number(plan.target.id) !== resultId || plan.tenantId !== result.tenantId || result.field !== plan.operation.field || result.beforeValue !== plan.operation.expectedValue || result.afterValue !== plan.operation.newValue || result.beforeLastUpdated !== plan.operation.expectedLastUpdated) throw new GovernanceStateError('Execution result does not match the prepared plan.');
    plan.execution = { ...result, executedBy: actor.subjectId, executedAt: this.now().toISOString() }; plan.state = 'executed'; this.record(plan, 'execution_succeeded', actor.subjectId, null); return copyPlan(plan);
  }
  completeInventoryExecution(actor: GovernanceActor, planId: string, result: InventoryIntentWriteResult): ActionPlan {
    const plan = this.getOwnedPlan(actor, planId); const operation = plan.operation;
    if (plan.state !== 'executing' || !operation || !isInventoryIntent(operation) || result.recordType !== operation.targetKind || result.recordId !== operation.targetId || result.tenantId !== plan.tenantId || result.action !== operation.action || !same(result.before, operation.expected) || !same(result.after, operation.desired) || result.beforeLastUpdated !== operation.expectedLastUpdated) throw new GovernanceStateError('Inventory execution result does not match the prepared plan.');
    plan.execution = { ...result, executedBy: actor.subjectId, executedAt: this.now().toISOString() }; plan.state = 'executed'; this.record(plan, 'execution_succeeded', actor.subjectId, null); return copyPlan(plan);
  }
  completeProvisioningExecution(actor: GovernanceActor, planId: string, result: SiteProvisioningExecution): ActionPlan { const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'executing' || !plan.provisioning || result.state !== 'executed' || result.manifestDigest !== plan.provisioning.manifestDigest) throw new GovernanceStateError('Provisioning result does not match the prepared plan.'); plan.execution = { ...result, created: result.created.map(x=>({...x})), compensated: result.compensated.map(x=>({...x})), errors: [...result.errors], executedBy: actor.subjectId, executedAt: this.now().toISOString() }; plan.state = 'executed'; this.record(plan, 'execution_succeeded', actor.subjectId, null); return copyPlan(plan); }
  failExecution(actor: GovernanceActor, planId: string, reason: string): ActionPlan { const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'executing') throw new GovernanceStateError('Action plan is not executing.'); plan.state = 'execution_failed'; this.record(plan, 'execution_failed', actor.subjectId, reason); return copyPlan(plan); }
  prepareRollback(actor: GovernanceActor, planId: string): ActionPlan {
    requireCapability(actor, 'plan:execute'); const plan = this.getOwnedPlan(actor, planId); if (plan.state !== 'executed' || !plan.execution || (!plan.operation && !plan.provisioning)) throw new GovernanceStateError(`Action plan cannot be rolled back from state ${plan.state}.`); plan.state = 'rolling_back'; this.record(plan, 'rollback_started', actor.subjectId, null); return copyPlan(plan);
  }
  completeRollback(actor: GovernanceActor, planId: string, result: DeviceMetadataWriteResult | SiteInformationWriteResult): ActionPlan { const plan = this.getOwnedPlan(actor, planId); const resultId = 'deviceId' in result ? result.deviceId : result.siteId; const prior=plan.execution;if (plan.state !== 'rolling_back' || !prior || !('field'in prior)) throw new GovernanceStateError('Rollback result does not restore the recorded prior value.');const priorId='deviceId'in prior?prior.deviceId:prior.siteId;if(resultId !== priorId || result.tenantId !== plan.tenantId || result.field !== prior.field || result.beforeValue !== prior.afterValue || result.afterValue !== prior.beforeValue || result.beforeLastUpdated !== prior.afterLastUpdated) throw new GovernanceStateError('Rollback result does not restore the recorded prior value.'); plan.rollback = { ...result, rolledBackBy: actor.subjectId, rolledBackAt: this.now().toISOString() }; plan.state = 'rolled_back'; this.record(plan, 'rollback_succeeded', actor.subjectId, null); return copyPlan(plan); }
  completeInventoryRollback(actor: GovernanceActor, planId: string, result: InventoryIntentWriteResult): ActionPlan { const plan=this.getOwnedPlan(actor,planId);const prior=plan.execution;if(plan.state!=='rolling_back'||!prior||!isInventoryResult(prior)||result.recordType!==prior.recordType||result.recordId!==prior.recordId||result.tenantId!==plan.tenantId||result.action!==prior.action||!same(result.before,prior.after)||!same(result.after,prior.before)||result.beforeLastUpdated!==prior.afterLastUpdated)throw new GovernanceStateError('Inventory rollback result does not restore the recorded prior values.');plan.rollback={...result,rolledBackBy:actor.subjectId,rolledBackAt:this.now().toISOString()};plan.state='rolled_back';this.record(plan,'rollback_succeeded',actor.subjectId,null);return copyPlan(plan);}
  completeProvisioningRollback(actor: GovernanceActor, planId: string, result: SiteProvisioningExecution): ActionPlan { const plan=this.getOwnedPlan(actor,planId); if(plan.state!=='rolling_back'||!plan.provisioning||result.state!=='compensated'||result.manifestDigest!==plan.provisioning.manifestDigest||result.compensated.length!==result.created.length)throw new GovernanceStateError('Provisioning rollback did not remove the complete recorded creation set.');plan.rollback={...result,created:result.created.map(x=>({...x})),compensated:result.compensated.map(x=>({...x})),errors:[...result.errors],rolledBackBy:actor.subjectId,rolledBackAt:this.now().toISOString()};plan.state='rolled_back';this.record(plan,'rollback_succeeded',actor.subjectId,null);return copyPlan(plan);}
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
    if (input.provisioning !== undefined && input.provisioning !== null && (!input.provisioning.manifest || input.provisioning.manifest.tenantSlug !== input.provisioning.manifest.tenantSlug.trim() || !/^[a-f0-9]{64}$/.test(input.provisioning.manifestDigest))) throw new GovernanceValidationError('Governed provisioning payload is invalid.');
    if (input.operation && input.provisioning) throw new GovernanceValidationError('Action plan cannot contain both metadata and provisioning operations.');
  }
  private validateStoredPlan(plan: ActionPlan): void { this.validateInput(plan, false); if (!isExactText(plan.id) || !isExactText(plan.tenantId) || !isExactText(plan.initiatedBy) || !isExactText(plan.createdAt) || !['planned', 'approved', 'rejected', 'expired', 'executing', 'executed', 'execution_failed', 'rolling_back', 'rolled_back', 'rollback_failed'].includes(plan.state)) throw new GovernanceValidationError('Governance plan snapshot is invalid.'); plan.operation ??= null; plan.provisioning ??= null; plan.execution ??= null; plan.rollback ??= null; }
}

function isExactText(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function copyPlan(plan: ActionPlan): ActionPlan { return structuredClone(plan); }
function validateOperation(operation: GovernedChange): void { if (isInventoryIntent(operation)) { const expectedTarget = operation.action === 'ip-address-reassign' ? 'netbox-ip-address' : operation.action === 'interface-intent-update' ? 'netbox-interface' : 'netbox-device'; if (!inventoryIntentActions.includes(operation.action) || operation.targetKind !== expectedTarget || !Number.isInteger(operation.targetId) || operation.targetId < 1 || !isExactText(operation.tenantId) || !isExactText(operation.expectedLastUpdated) || Number.isNaN(Date.parse(operation.expectedLastUpdated)) || !plain(operation.expected) || !plain(operation.desired)) throw new GovernanceValidationError('Governed inventory intent is invalid.'); return; } const statuses = ['matched', 'drifted', 'missing-observation', 'exception', 'not-evaluated']; const version = (value: unknown) => value === null || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+:-]{0,63}$/.test(value)); const site = isSiteChange(operation); const validSite = site && typeof operation.expectedValue === 'string' && typeof operation.newValue === 'string' && operation.newValue.length <= 200 && operation.newValue.trim() === operation.newValue && !/[\u0000-\u001f\u007f]/.test(operation.newValue); const validDevice = !site && (operation.field === 'reconciliation_status' ? (operation.expectedValue === null || statuses.includes(String(operation.expectedValue))) && (operation.newValue !== null && statuses.includes(String(operation.newValue))) : ['observed_software_version', 'minimum_approved_version'].includes(operation.field) && version(operation.expectedValue) && version(operation.newValue)); if (!operation || !(validSite || validDevice) || operation.expectedValue === operation.newValue || !isExactText(operation.expectedLastUpdated) || Number.isNaN(Date.parse(operation.expectedLastUpdated))) throw new GovernanceValidationError('Governed write operation is invalid.'); }
function isSiteChange(operation: GovernedChange): operation is SiteInformationChange { return !isInventoryIntent(operation) && ['physical_address', 'shipping_address', 'description', 'facility', 'time_zone'].includes(operation?.field); }
function isInventoryIntent(operation: GovernedChange): operation is InventoryIntent { return typeof operation === 'object' && operation !== null && 'action' in operation && 'targetKind' in operation && 'targetId' in operation; }
function isInventoryResult(value: unknown): value is InventoryIntentWriteResult { return typeof value === 'object' && value !== null && 'recordType' in value && 'recordId' in value && 'before' in value && 'after' in value; }
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
