import assert from 'node:assert/strict';
import test from 'node:test';
import { NetBoxInventoryIntentError, NetBoxInventoryIntentWriter } from '../src/netbox-inventory-intent-writer.js';

const version = '2026-08-05T18:00:00.000Z';
const nextVersion = '2026-08-05T18:00:01.000Z';
const writer = (records: Record<string, Record<string, unknown>>) => new NetBoxInventoryIntentWriter({ baseUrl: 'https://netbox.example/', token: 'test-token', fetch: async (input, init) => {
  const path = new URL(String(input)).pathname; const record = records[path];
  if (!record) return new Response(JSON.stringify({}), { status: 404 });
  if (init?.method === 'PATCH') { Object.assign(record, JSON.parse(String(init.body))); record.last_updated = nextVersion; }
  return new Response(JSON.stringify(record));
} });

test('executes only the fixed device lifecycle route and verifies tenant and optimistic preconditions', async () => {
  const records = { '/api/dcim/devices/7/': { id: 7, url: '/api/dcim/devices/7/', tenant: { slug: 'northstar' }, status: 'planned', last_updated: version } };
  const result = await writer(records).execute({ action: 'device-lifecycle-change', targetKind: 'netbox-device', targetId: 7, tenantId: 'northstar', expectedLastUpdated: version, expected: { status: 'planned' }, desired: { status: 'active' } });
  assert.equal(result.after.status, 'active'); assert.equal(result.recordType, 'netbox-device');
});

test('rejects generic, cross-tenant, stale, and destructive-decommission payloads before a write', async () => {
  const records = { '/api/dcim/devices/7/': { id: 7, tenant: { slug: 'other' }, status: 'active', last_updated: version } };
  await assert.rejects(writer(records).execute({ action: 'device-lifecycle-change', targetKind: 'netbox-device', targetId: 7, tenantId: 'northstar', expectedLastUpdated: version, expected: { status: 'active' }, desired: { status: 'offline' } }), NetBoxInventoryIntentError);
  await assert.rejects(writer(records).execute({ action: 'device-decommission', targetKind: 'netbox-device', targetId: 7, tenantId: 'northstar', expectedLastUpdated: version, expected: { status: 'active' }, desired: { status: 'decommissioning', delete: true } } as never), NetBoxInventoryIntentError);
});

test('uses a fixed IP assignment payload and returns a reversible exact before/after record', async () => {
  const records = { '/api/ipam/ip-addresses/9/': { id: 9, url: '/api/ipam/ip-addresses/9/', tenant: { slug: 'northstar' }, assigned_object_type: 'dcim.interface', assigned_object_id: 11, last_updated: version } };
  const result = await writer(records).execute({ action: 'ip-address-reassign', targetKind: 'netbox-ip-address', targetId: 9, tenantId: 'northstar', expectedLastUpdated: version, expected: { assigned_object_type: 'dcim.interface', assigned_object_id: 11 }, desired: { assigned_object_type: 'dcim.interface', assigned_object_id: 12 } });
  assert.deepEqual(result.before, { assigned_object_type: 'dcim.interface', assigned_object_id: 11 }); assert.deepEqual(result.after, { assigned_object_type: 'dcim.interface', assigned_object_id: 12 });
});
