import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveVerifiedOidcActor } from '../src/governance-identity.js';
import { FileGovernanceStore } from '../src/governance-storage.js';
import { GovernanceAuthorizationError, InMemoryActionGovernance } from '../src/governance.js';

test('persists and restores the full governance snapshot locally', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'enterprise-mcp-kit-')); try {
    const store = new FileGovernanceStore(join(folder, 'governance.json')); const now = () => new Date('2026-07-29T12:00:00Z'); const service = new InMemoryActionGovernance(now, () => 'plan-1');
    const plan = service.createPlan({ subjectId: 'planner', tenantId: 'northstar', roles: ['planner'] }, { actionType: 'netbox.device.update', target: { kind: 'netbox-device', id: '7' }, proposedChange: 'Change role.', confidence: 0.8, evidence: [{ source: 'api/dcim/devices/7/', summary: 'Observed role.' }], ruleVersion: 'v1', promptVersion: null, expiresAt: '2026-07-29T12:10:00Z' });
    await store.save(service.snapshot()); const restored = new InMemoryActionGovernance(now, () => 'event-1'); restored.restore(await store.load());
    assert.equal(restored.getPlan({ subjectId: 'reader', tenantId: 'northstar', roles: ['auditor'] }, plan.id).actionType, 'netbox.device.update');
  } finally { await rm(folder, { recursive: true, force: true }); }
});
test('accepts only already-verified OIDC claims with matching issuer and audience', () => {
  const actor = resolveVerifiedOidcActor({ iss: 'https://issuer.example', aud: ['enterprise-mcp-kit'], azp: 'enterprise-mcp-kit', sub: 'user-1', tenant_id: 'northstar', roles: ['planner'], iat: 1, jti: 'jti-1' }, { issuer: 'https://issuer.example', audience: 'enterprise-mcp-kit' });
  assert.deepEqual(actor, { subjectId: 'user-1', tenantId: 'northstar', roles: ['planner'] });
  assert.throws(() => resolveVerifiedOidcActor({ iss: 'https://other.example', aud: 'enterprise-mcp-kit', azp: 'enterprise-mcp-kit', sub: 'user-1', tenant_id: 'northstar', roles: ['planner'], iat: 1, jti: 'jti-2' }, { issuer: 'https://issuer.example', audience: 'enterprise-mcp-kit' }), GovernanceAuthorizationError);
  assert.throws(() => resolveVerifiedOidcActor({ iss: 'https://issuer.example', aud: 'enterprise-mcp-kit', azp: 'enterprise-mcp-kit', sub: 'user-1', tenant_id: 'northstar', roles: ['realm-admin'], iat: 1, jti: 'jti-3' }, { issuer: 'https://issuer.example', audience: 'enterprise-mcp-kit' }), GovernanceAuthorizationError);
});
