import assert from 'node:assert/strict';
import test from 'node:test';
import { GovernanceAuthorizationError, GovernanceStateError, InMemoryActionGovernance } from '../src/governance.js';

const planner = { subjectId: 'planner-1', tenantId: 'northstar', roles: ['planner'] };
const approver = { subjectId: 'approver-1', tenantId: 'northstar', roles: ['approver'] };
const otherTenant = { subjectId: 'approver-2', tenantId: 'summit', roles: ['approver'] };
const clock = () => new Date('2026-07-29T12:00:00Z');
const planInput = { actionType: 'netbox.device.update', target: { kind: 'netbox-device', id: '7' }, proposedChange: 'Change device role to edge-router.', confidence: 0.8, evidence: [{ source: 'api/dcim/devices/7/', summary: 'Current role is router.' }], ruleVersion: 'governance-v1', promptVersion: 'plan-v1', expiresAt: '2026-07-29T12:10:00Z' };

test('creates explainable, tenant-scoped plans and records immutable-style audit events', () => {
  let id = 0; const governance = new InMemoryActionGovernance(clock, () => `id-${++id}`);
  const plan = governance.createPlan(planner, planInput);
  assert.equal(plan.state, 'planned'); assert.equal(plan.initiatedBy, planner.subjectId);
  assert.deepEqual(governance.listAuditEvents(planner, plan.id).map((event) => event.event), ['plan_created']);
  const approved = governance.approvePlan(approver, plan.id, 'Approved after review.');
  assert.equal(approved.state, 'approved'); assert.equal(approved.approvedBy, approver.subjectId);
  assert.deepEqual(governance.listAuditEvents(approver, plan.id).map((event) => event.event), ['plan_created', 'plan_approved']);
});
test('requires an approver in the same tenant and never exposes an execution operation', () => {
  const governance = new InMemoryActionGovernance(clock, () => 'plan-1'); const plan = governance.createPlan(planner, planInput);
  assert.throws(() => governance.approvePlan(planner, plan.id, 'Self approval.'), GovernanceAuthorizationError);
  assert.throws(() => governance.approvePlan(otherTenant, plan.id, 'Cross tenant.'), GovernanceAuthorizationError);
  assert.equal(typeof (governance as unknown as Record<string, unknown>).executePlan, 'undefined');
});
test('expires stale plans and blocks approval after expiration', () => {
  let now = new Date('2026-07-29T12:00:00Z'); const governance = new InMemoryActionGovernance(() => now, () => 'plan-1');
  const plan = governance.createPlan(planner, planInput);
  now = new Date('2026-07-29T12:11:00Z');
  assert.throws(() => governance.approvePlan(approver, plan.id, 'Too late.'), GovernanceStateError);
  assert.equal(governance.getPlan(approver, plan.id).state, 'expired');
});
