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
test('admits a strict software-version operation but rejects mismatched action types', () => {
  let id = 0; const governance = new InMemoryActionGovernance(clock, () => `version-${++id}`); const input = { ...planInput, actionType: 'netbox.device.software-version.update', proposedChange: 'Record observed version 12.4.4.', operation: { field: 'observed_software_version' as const, expectedValue: '12.4.3', newValue: '12.4.4', expectedLastUpdated: '2026-07-29T11:59:00Z' } };
  const plan = governance.createPlan(planner, input); governance.approvePlan(approver, plan.id, 'Version evidence reviewed.'); assert.equal(governance.prepareExecution(executor, plan.id).state, 'executing');
  const bad = governance.createPlan(planner, { ...input, actionType: 'netbox.device.metadata.update' }); governance.approvePlan(approver, bad.id, 'Wrong action test.'); assert.throws(() => governance.prepareExecution(executor, bad.id));
});
test('admits one exact site-information field with a matching action and target', () => { let id = 0; const governance = new InMemoryActionGovernance(clock, () => `site-${++id}`); const input = { ...planInput, actionType: 'netbox.site.information.update', target: { kind: 'netbox-site', id: '3' }, proposedChange: 'Update the recorded physical address.', operation: { field: 'physical_address' as const, expectedValue: '100 Example Ave', newValue: '200 Example Ave', expectedLastUpdated: '2026-07-29T11:59:00Z' } }; const plan = governance.createPlan(planner, input); governance.approvePlan(approver, plan.id, 'Address evidence reviewed.'); assert.equal(governance.prepareExecution(executor, plan.id).state, 'executing'); const result = governance.completeExecution(executor, plan.id, { siteId: 3, siteName: 'Northstar Phoenix DC1', tenantId: 'northstar', field: 'physical_address', beforeValue: '100 Example Ave', afterValue: '200 Example Ave', beforeLastUpdated: '2026-07-29T11:59:00Z', afterLastUpdated: '2026-07-29T12:00:01Z', source: 'api/dcim/sites/3/' }); assert.equal(result.state, 'executed'); });
test('admits, executes, and rolls back one exact inventory intent without widening the action surface', () => { const governance = new InMemoryActionGovernance(clock, () => 'inventory-1'); const input = { ...planInput, actionType: 'netbox.device-lifecycle-change', target: { kind: 'netbox-device', id: '7' }, proposedChange: 'Move the reviewed device from planned to active.', operation: { action: 'device-lifecycle-change' as const, targetKind: 'netbox-device' as const, targetId: 7, tenantId: 'northstar', expectedLastUpdated: '2026-07-29T11:59:00Z', expected: { status: 'planned' }, desired: { status: 'active' } } }; const plan = governance.createPlan(planner, input); governance.approvePlan(approver, plan.id, 'Lifecycle evidence reviewed.'); assert.equal(governance.prepareExecution(executor, plan.id).state, 'executing'); const executed = governance.completeInventoryExecution(executor, plan.id, { recordType: 'netbox-device', recordId: 7, tenantId: 'northstar', action: 'device-lifecycle-change', before: { status: 'planned' }, after: { status: 'active' }, beforeLastUpdated: '2026-07-29T11:59:00Z', afterLastUpdated: '2026-07-29T12:00:01Z', source: 'api/dcim/devices/7/' }); assert.equal(executed.state, 'executed'); governance.prepareRollback(executor, plan.id); const rolled = governance.completeInventoryRollback(executor, plan.id, { recordType: 'netbox-device', recordId: 7, tenantId: 'northstar', action: 'device-lifecycle-change', before: { status: 'active' }, after: { status: 'planned' }, beforeLastUpdated: '2026-07-29T12:00:01Z', afterLastUpdated: '2026-07-29T12:00:02Z', source: 'api/dcim/devices/7/' }); assert.equal(rolled.state, 'rolled_back'); });
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
