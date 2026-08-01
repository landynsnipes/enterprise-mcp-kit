import assert from 'node:assert/strict'; import test from 'node:test';
import { NetBoxDeviceMetadataWriter, NetBoxWriteError } from '../src/netbox-metadata-writer.js';

const before = { id: 7, name: 'edge-01', tenant: { slug: 'northstar' }, last_updated: '2026-08-01T12:00:00Z', custom_fields: { reconciliation_status: 'matched' }, url: 'https://netbox.example/api/dcim/devices/7/' };
test('performs only an exact verified reconciliation-status patch', async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = []; const writer = new NetBoxDeviceMetadataWriter({ baseUrl: 'https://netbox.example', token: 'secret-token', fetch: async (url, init) => { calls.push({ url: String(url), method: String(init?.method), body: init?.body as string | undefined }); return new Response(JSON.stringify(init?.method === 'GET' ? before : { ...before, last_updated: '2026-08-01T12:01:00Z', custom_fields: { reconciliation_status: 'drifted' } })); } });
  const result = await writer.updateReconciliationStatus({ deviceId: 7, tenantId: 'northstar', field: 'reconciliation_status', expectedValue: 'matched', newValue: 'drifted', expectedLastUpdated: before.last_updated });
  assert.equal(result.afterValue, 'drifted'); assert.deepEqual(calls.map((call) => call.method), ['GET', 'PATCH']); assert.deepEqual(JSON.parse(calls[1].body!), { custom_fields: { reconciliation_status: 'drifted' } }); assert.ok(calls.every((call) => call.url === 'https://netbox.example/api/dcim/devices/7/'));
});
test('fails closed on tenant, stale-version, field, or value mismatch without patching', async () => {
  for (const input of [
    { deviceId: 7, tenantId: 'summit', field: 'reconciliation_status', expectedValue: 'matched', newValue: 'drifted', expectedLastUpdated: before.last_updated },
    { deviceId: 7, tenantId: 'northstar', field: 'reconciliation_status', expectedValue: 'matched', newValue: 'drifted', expectedLastUpdated: '2026-08-01T11:00:00Z' },
    { deviceId: 7, tenantId: 'northstar', field: 'description', expectedValue: 'matched', newValue: 'drifted', expectedLastUpdated: before.last_updated },
    { deviceId: 7, tenantId: 'northstar', field: 'reconciliation_status', expectedValue: 'matched', newValue: 'arbitrary', expectedLastUpdated: before.last_updated },
  ]) { let calls = 0; const writer = new NetBoxDeviceMetadataWriter({ baseUrl: 'https://netbox.example', token: 'secret-token', fetch: async () => { calls++; return new Response(JSON.stringify(before)); } }); await assert.rejects(writer.updateReconciliationStatus(input as never), NetBoxWriteError); assert.ok(calls <= 1); }
});
test('updates one admitted software-version field and verifies the exact patch', async () => {
  const versioned = { ...before, custom_fields: { ...before.custom_fields, observed_software_version: '12.4.3' } }; const calls: string[] = [];
  const writer = new NetBoxDeviceMetadataWriter({ baseUrl: 'https://netbox.example', token: 'secret-token', fetch: async (_url, init) => { calls.push(String(init?.body ?? 'GET')); return new Response(JSON.stringify(init?.method === 'GET' ? versioned : { ...versioned, last_updated: '2026-08-01T12:02:00Z', custom_fields: { ...versioned.custom_fields, observed_software_version: '12.4.4' } })); } });
  const result = await writer.updateDeviceMetadata({ deviceId: 7, tenantId: 'northstar', field: 'observed_software_version', expectedValue: '12.4.3', newValue: '12.4.4', expectedLastUpdated: before.last_updated });
  assert.equal(result.afterValue, '12.4.4'); assert.deepEqual(JSON.parse(calls[1]), { custom_fields: { observed_software_version: '12.4.4' } });
  await assert.rejects(writer.updateDeviceMetadata({ deviceId: 7, tenantId: 'northstar', field: 'observed_software_version', expectedValue: '12.4.3', newValue: 'version with spaces', expectedLastUpdated: before.last_updated }), NetBoxWriteError);
});
