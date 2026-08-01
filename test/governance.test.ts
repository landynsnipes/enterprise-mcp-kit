import assert from 'node:assert/strict';
import test from 'node:test';
import { GovernanceAuthorizationError, GovernanceStateError, InMemoryActionGovernance } from '../src/governance.js';

const planner = { subjectId: 'planner-1', tenantId: 'northstar', roles: ['planner'] };
const approver = { subjectId: 'approver-1', tenantId: 'northstar', roles: ['approver'] };
const executor = { subjectId: 'executor-1', tenantId: 'northstar', roles: ['executor'] };
const otherTenant = { subjectId: 'approver-2', tenantId: 'summit', roles: ['approver'] };
const clock = () => new Date('2026-07-29T12:00:00Z');
const planInput = { actionType: 'netbox.device.update', target: { kind: 'netbox-device', id: '7' }, proposedChange: 'Change device role to edge-router.', confidence: 0.8, evidence: [{ source: 'api/dcim/devices/7/', summary: 'Current role is router.' }], ruleVersion: 'governance-v1', promptVersion: 'plan-v1', expiresAt: '2026-07-29T12:10:00Z' };
const executablePlanInput = { ...planInput, actionType: 'netbox.device.metadata.update', proposedChange: 'Set reconciliation status from matched to drifted.', operation: { field: 'reconciliation_status' as const, expectedValue: 'matched' as const, newValue: 'drifted' as const, expectedLastUpdated: '2026-07-29T11:59:00Z' } };

test('creates explainable, tenant-scoped plans and records immutable-style audit events', () => {
  let id = 0; const governance = new InMemoryActionGovernance(clock, () => `id-${++id}`);
  const plan = governance.createPlan(planner, planInput);
  assert.equal(plan.state, 'planned'); assert.equal(plan.initiatedBy, planner.subjectId);
  assert.deepEqual(governance.listAuditEvents(approver, plan.id).map((event) => event.event), ['plan_created']);
  const approved = governance.approvePlan(approver, plan.id, 'Approved after review.');
  assert.equal(approved.state, 'approved'); assert.equal(approved.approvedBy, approver.subjectId);
  assert.deepEqual(governance.listAuditEvents(approver, plan.id).map((event) => event.event), ['plan_created', 'plan_approved']);
});
test('requires an approver in the same tenant', () => {
  const governance = new InMemoryActionGovernance(clock, () => 'plan-1'); const plan = governance.createPlan(planner, planInput);
  assert.throws(() => governance.approvePlan(planner, plan.id, 'Self approval.'), GovernanceAuthorizationError);
  assert.throws(() => governance.approvePlan(otherTenant, plan.id, 'Cross tenant.'), GovernanceAuthorizationError);
});
test('executes and rolls back only an approved exact operation with three-person separation', () => {
  let id = 0; const governance = new InMemoryActionGovernance(clock, () => `id-${++id}`); const plan = governance.createPlan(planner, executablePlanInput); governance.approvePlan(approver, plan.id, 'Evidence checked.');
  assert.throws(() => governance.prepareExecution(planner, plan.id), GovernanceAuthorizationError); assert.throws(() => governance.prepareExecution(approver, plan.id), GovernanceAuthorizationError);
  assert.equal(governance.prepareExecution(executor, plan.id).state, 'executing');
  const executed = governance.completeExecution(executor, plan.id, { deviceId: 7, deviceName: 'edge-01', tenantId: 'northstar', field: 'reconciliation_status', beforeValue: 'matched', afterValue: 'drifted', beforeLastUpdated: '2026-07-29T11:59:00Z', afterLastUpdated: '2026-07-29T12:00:01Z', source: 'api/dcim/devices/7/' }); assert.equal(executed.state, 'executed');
  assert.equal(governance.prepareRollback(executor, plan.id).state, 'rolling_back');
  const rolledBack = governance.completeRollback(executor, plan.id, { deviceId: 7, deviceName: 'edge-01', tenantId: 'northstar', field: 'reconciliation_status', beforeValue: 'drifted', afterValue: 'matched', beforeLastUpdated: '2026-07-29T12:00:01Z', afterLastUpdated: '2026-07-29T12:00:02Z', source: 'api/dcim/devices/7/' }); assert.equal(rolledBack.state, 'rolled_back');
  assert.deepEqual(governance.listAuditEvents(executor, plan.id).map((event) => event.event), ['plan_created', 'plan_approved', 'execution_started', 'execution_succeeded', 'rollback_started', 'rollback_succeeded']);
});
test('enforces separation of duties even when an identity has both roles', () => {
  const governance = new InMemoryActionGovernance(clock, () => 'plan-1');
  const dualRole = { subjectId: 'dual-1', tenantId: 'northstar', roles: ['planner', 'approver'] };
  const plan = governance.createPlan(dualRole, planInput);
  assert.throws(() => governance.approvePlan(dualRole, plan.id, 'Self approval.'), GovernanceAuthorizationError);
  assert.throws(() => governance.rejectPlan(dualRole, plan.id, 'Self rejection.'), GovernanceAuthorizationError);
});
test('maps roles to fixed capabilities and rejects unknown roles', () => {
  const governance = new InMemoryActionGovernance(clock, () => 'plan-1');
  assert.throws(() => governance.createPlan({ subjectId: 'unknown', tenantId: 'northstar', roles: ['realm-admin'] }, planInput), GovernanceAuthorizationError);
});
test('expires stale plans and blocks approval after expiration', () => {
  let now = new Date('2026-07-29T12:00:00Z'); const governance = new InMemoryActionGovernance(() => now, () => 'plan-1');
  const plan = governance.createPlan(planner, planInput);
  now = new Date('2026-07-29T12:11:00Z');
  assert.throws(() => governance.approvePlan(approver, plan.id, 'Too late.'), GovernanceStateError);
  assert.equal(governance.getPlan(approver, plan.id).state, 'expired');
});
