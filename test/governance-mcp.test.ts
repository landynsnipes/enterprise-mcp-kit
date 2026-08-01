import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createGovernanceMcpServer } from '../src/governance-mcp.js';
import { InMemoryActionGovernance, type GovernanceActor } from '../src/governance.js';

const planner: GovernanceActor = { subjectId: 'planner', tenantId: 'northstar', roles: ['planner'] };
const approver: GovernanceActor = { subjectId: 'approver', tenantId: 'northstar', roles: ['approver'] };
const input = { actionType: 'netbox.device.update', target: { kind: 'netbox-device', id: '7' }, proposedChange: 'Change role.', confidence: 0.8, evidence: [{ source: 'api/dcim/devices/7/', summary: 'Current role.' }], ruleVersion: 'v1', promptVersion: null, expiresAt: '2026-07-29T00:10:00.000Z' };
test('governance MCP tools use injected identity and do not expose execution', async () => {
  let actor = planner; const governance = new InMemoryActionGovernance(() => new Date('2026-07-29T00:00:00Z'), () => 'plan-1'); const server = createGovernanceMcpServer(governance, { getActor: () => actor }); const client = new Client({ name: 'test', version: '1' }); const [a, b] = InMemoryTransport.createLinkedPair(); await Promise.all([server.connect(a), client.connect(b)]);
  try { const tools = await client.listTools(); assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['approve_action_plan', 'create_action_plan', 'get_action_plan', 'reject_action_plan']); assert.ok(tools.tools.every((tool) => /never executes/i.test(tool.description ?? ''))); const created = await client.callTool({ name: 'create_action_plan', arguments: input }) as any; assert.equal(created.structuredContent.initiatedBy, 'planner'); actor = approver; const approved = await client.callTool({ name: 'approve_action_plan', arguments: { planId: 'plan-1', reason: 'Reviewed.' } }) as any; assert.equal(approved.structuredContent.approvedBy, 'approver'); assert.match(approved.content[0].text, /no external action was executed/i); } finally { await client.close(); await server.close(); }
});
