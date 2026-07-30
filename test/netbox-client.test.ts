import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceLookupValidationError, HttpNetBoxClient, NetBoxClientConfigurationError, NetBoxRequestError, validateConnectivityLookup, validateDeviceLookup, validateRackLookup, validateSiteLookup } from '../src/netbox-client.js';

const token = 'test-token';
const device = {
  id: 7,
  name: 'edge-01',
  status: { value: 'active' },
  site: { name: 'lab' },
  role: { name: 'router' },
  device_type: { model: 'X1' },
  platform: { name: 'Example Network OS' },
  custom_fields: {
    observed_software_version: '12.4.3',
    minimum_approved_version: '12.4.0',
    version_compliance: 'meets-example-policy',
    version_evidence_source: 'sanitized-lab-seed',
    version_observed_at: '2026-07-28T12:00:00Z',
  },
  primary_ip4: { address: '192.0.2.7/24' },
  primary_ip6: { address: '2001:db8::7/64' },
  url: 'https://netbox.example/api/dcim/devices/7/',
};
function client(response: Response | Promise<Response>, capture?: RequestInit[]): HttpNetBoxClient { return new HttpNetBoxClient({ baseUrl: 'https://netbox.example/', token, fetch: async (_url, init) => { capture?.push(init!); return response; } }); }

test('accepts HTTP and HTTPS lab client configuration', () => { for (const baseUrl of ['http://netbox.lab.test:8000', 'https://netbox.example']) assert.ok(new HttpNetBoxClient({ baseUrl, token, timeoutMs: 1, fetch: async () => new Response('{}') })); });
for (const [label, options] of [
  ['empty token', { baseUrl: 'https://netbox.example', token: '' }], ['padded token', { baseUrl: 'https://netbox.example', token: ` ${token}` }],
  ['zero timeout', { baseUrl: 'https://netbox.example', token, timeoutMs: 0 }], ['fractional timeout', { baseUrl: 'https://netbox.example', token, timeoutMs: 1.5 }], ['infinite timeout', { baseUrl: 'https://netbox.example', token, timeoutMs: Infinity }], ['string timeout', { baseUrl: 'https://netbox.example', token, timeoutMs: '1' }],
  ['FTP URL', { baseUrl: 'ftp://netbox.example', token }], ['credential URL', { baseUrl: `https://user:${token}@netbox.example`, token }], ['malformed URL', { baseUrl: 'not a URL', token }], ['non-callable fetch', { baseUrl: 'https://netbox.example', token, fetch: 1 }]
] as const) test(`rejects ${label} configuration without exposing token`, () => assert.throws(() => new HttpNetBoxClient(options as never), (error: Error) => error instanceof NetBoxClientConfigurationError && !error.message.includes(token)));

test('validates name and ID inputs', () => { assert.deepEqual(validateDeviceLookup({ name: 'edge-01' }), { name: 'edge-01' }); assert.deepEqual(validateDeviceLookup({ id: 7 }), { id: 7 }); });
for (const value of [{}, { name: 'x', id: 1 }, { name: '' }, { name: ' x' }, { name: 'x ' }, { name: '*' }, { name: ['x'] }, { name: 7 }, { id: 0 }, { id: 1.2 }, { id: '1' }, [], null]) test(`rejects invalid input ${JSON.stringify(value)}`, () => assert.throws(() => validateDeviceLookup(value), DeviceLookupValidationError));
test('validates exact site name and ID inputs', () => { assert.deepEqual(validateSiteLookup({ name: 'Phoenix DC1' }), { name: 'Phoenix DC1' }); assert.deepEqual(validateSiteLookup({ id: 2 }), { id: 2 }); });
for (const value of [{}, { name: 'x', id: 1 }, { name: '' }, { name: ' x' }, { name: '*' }, { id: 0 }, { id: '1' }, [], null]) test(`rejects invalid site input ${JSON.stringify(value)}`, () => assert.throws(() => validateSiteLookup(value), DeviceLookupValidationError));
test('validates exact, distinct connectivity site names', () => assert.deepEqual(validateConnectivityLookup({ fromSite: 'Northstar Phoenix DC1', toSite: 'Northstar Reno DR' }), { fromSite: 'Northstar Phoenix DC1', toSite: 'Northstar Reno DR' }));
for (const value of [{}, { fromSite: 'A' }, { fromSite: 'A', toSite: 'A' }, { fromSite: ' A', toSite: 'B' }, { fromSite: 'A', toSite: '*' }, { fromSite: 'A', toSite: 'B', extra: true }, [], null]) test(`rejects invalid connectivity input ${JSON.stringify(value)}`, () => assert.throws(() => validateConnectivityLookup(value), DeviceLookupValidationError));
test('validates rack ID or exact site and rack name', () => { assert.deepEqual(validateRackLookup({ id: 1 }), { id: 1 }); assert.deepEqual(validateRackLookup({ site: 'Northstar Phoenix DC1', name: 'PHX-A01' }), { site: 'Northstar Phoenix DC1', name: 'PHX-A01' }); });
for (const value of [{}, { id: 0 }, { id: '1' }, { name: 'PHX-A01' }, { site: 'A', name: '*' }, { site: ' A', name: 'R1' }, { site: 'A', name: 'R1', extra: true }, [], null]) test(`rejects invalid rack input ${JSON.stringify(value)}`, () => assert.throws(() => validateRackLookup(value), DeviceLookupValidationError));
test('uses GET-only exact endpoints and maps approved fields', async () => { const calls: RequestInit[] = []; let seen = ''; const adapter = new HttpNetBoxClient({ baseUrl: 'https://netbox.example/', token, fetch: async (url, init) => { seen = String(url); calls.push(init!); return new Response(JSON.stringify(device), { status: 200 }); } }); const result = await adapter.getDeviceContext({ id: 7 }); assert.equal(seen, 'https://netbox.example/api/dcim/devices/7/'); assert.equal(calls[0].method, 'GET'); assert.deepEqual(result, { id: 7, name: 'edge-01', status: 'active', site: 'lab', role: 'router', deviceType: 'X1', platform: 'Example Network OS', observedSoftwareVersion: '12.4.3', minimumApprovedVersion: '12.4.0', versionCompliance: 'meets-example-policy', versionEvidenceSource: 'sanitized-lab-seed', versionObservedAt: '2026-07-28T12:00:00Z', primaryIpv4: '192.0.2.7/24', primaryIpv6: '2001:db8::7/64', source: device.url }); });
test('uses encoded name endpoint and rejects missing or ambiguous results', async () => { let seen = ''; const ok = new HttpNetBoxClient({ baseUrl: 'https://netbox.example', token, fetch: async (url) => { seen = String(url); return new Response(JSON.stringify({ results: [device] })); } }); await ok.getDeviceContext({ name: 'edge-01' }); assert.equal(seen, 'https://netbox.example/api/dcim/devices/?name=edge-01'); for (const results of [[], [device, device]]) await assert.rejects(client(new Response(JSON.stringify({ results }))).getDeviceContext({ name: 'edge-01' }), NetBoxRequestError); });
test('builds a bounded exact site overview from fixed read-only endpoints', async () => {
  const site = { id: 2, name: 'Phoenix DC1', status: { value: 'active' }, region: { name: 'US West' }, tenant: { name: 'Northstar' }, facility: 'PHX-DC1', url: 'https://netbox.example/api/dcim/sites/2/' };
  const seen: string[] = [];
  const adapter = new HttpNetBoxClient({
    baseUrl: 'https://netbox.example',
    token,
    fetch: async (url, init) => {
      assert.equal(init?.method, 'GET');
      const path = new URL(String(url)).pathname + new URL(String(url)).search;
      seen.push(path);
      if (path === '/api/dcim/sites/?name=Phoenix%20DC1') return new Response(JSON.stringify({ count: 1, results: [site] }));
      if (path.startsWith('/api/dcim/devices/')) return new Response(JSON.stringify({ count: 1, results: [device] }));
      if (path.startsWith('/api/dcim/racks/')) return new Response(JSON.stringify({ count: 2, results: [{ id: 1 }, { id: 2 }] }));
      if (path.startsWith('/api/circuits/circuits/')) return new Response(JSON.stringify({ count: 3, results: [] }));
      if (path.startsWith('/api/tenancy/contact-assignments/')) return new Response(JSON.stringify({ count: 1, results: [{ id: 1 }] }));
      return new Response('{}', { status: 404 });
    },
  });
  const result = await adapter.getSiteOverview({ name: 'Phoenix DC1' });
  assert.equal(result.name, 'Phoenix DC1');
  assert.equal(result.deviceCount, 1);
  assert.equal(result.rackCount, 2);
  assert.equal(result.activeCircuitCount, 3);
  assert.equal(result.contactAssignmentCount, 1);
  assert.equal(result.softwareCompliantCount, 1);
  assert.equal(result.softwareNonCompliantCount, 0);
  assert.equal(result.softwareUnknownCount, 0);
  assert.equal(result.devices[0].observedSoftwareVersion, '12.4.3');
  assert.equal(result.truncated, false);
  assert.deepEqual(seen.sort(), [
    '/api/circuits/circuits/?site_id=2&status=active&limit=100',
    '/api/dcim/devices/?site_id=2&limit=100',
    '/api/dcim/racks/?site_id=2&limit=100',
    '/api/dcim/sites/?name=Phoenix%20DC1',
    '/api/tenancy/contact-assignments/?object_type=dcim.site&object_id=2&limit=100',
  ].sort());
});
for (const [status, message] of [[401, 'authenticated'], [403, 'authorized'], [404, 'not found'], [429, 'rate limited'], [500, 'unavailable']] as const) test(`maps HTTP ${status} without secrets`, async () => { await assert.rejects(client(new Response('raw-body', { status })).getDeviceContext({ id: 7 }), (error: Error) => error.message.includes(message) && !error.message.includes(token) && !error.message.includes('raw-body')); });
test('maps malformed JSON, timeout, and network errors without secrets', async () => { await assert.rejects(client(new Response('{', { status: 200 })).getDeviceContext({ id: 7 }), /invalid JSON/); const timed = new HttpNetBoxClient({ baseUrl: 'https://netbox.example', token, timeoutMs: 1, fetch: async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })))) }); await assert.rejects(timed.getDeviceContext({ id: 7 }), /timed out/); await assert.rejects(new HttpNetBoxClient({ baseUrl: 'https://netbox.example', token, fetch: async () => { throw new Error('raw-body ' + token); } }).getDeviceContext({ id: 7 }), (error: Error) => error.message === 'NetBox request failed.'); });
test('traces recorded power ports through PDU outlets to matching rack feeds', async () => {
  const deviceRecord = { id: 7, name: 'edge-01', site: { name: 'Phoenix' }, rack: { id: 1, name: 'PHX-A01' } };
  const responses: Record<string, unknown> = {
    '/api/dcim/devices/7/': deviceRecord,
    '/api/dcim/power-ports/?device_id=7&limit=100': { count: 2, results: [{ id: 11, name: 'PSU-A', maximum_draw: 600, allocated_draw: 300, connected_endpoints: [{ id: 21, device: { id: 81, name: 'pdu-a' } }] }, { id: 12, name: 'PSU-B', maximum_draw: 600, allocated_draw: 300, connected_endpoints: [{ id: 22, device: { id: 82, name: 'pdu-b' } }] }] },
    '/api/dcim/power-feeds/?rack_id=1&limit=100': { count: 2, results: [{ id: 31, name: 'FEED-A', status: { value: 'active' }, type: { value: 'primary' } }, { id: 32, name: 'FEED-B', status: { value: 'active' }, type: { value: 'redundant' } }] },
    '/api/dcim/power-outlets/?device_id=81&limit=100': { count: 1, results: [{ id: 21, name: 'A-01', feed_leg: 'A', power_port: { id: 41 } }] },
    '/api/dcim/power-ports/?device_id=81&limit=100': { count: 1, results: [{ id: 41, connected_endpoints: [{ id: 31 }] }] },
    '/api/dcim/power-outlets/?device_id=82&limit=100': { count: 1, results: [{ id: 22, name: 'B-01', feed_leg: 'B', power_port: { id: 42 } }] },
    '/api/dcim/power-ports/?device_id=82&limit=100': { count: 1, results: [{ id: 42, connected_endpoints: [{ id: 32 }] }] },
  };
  const seen: string[] = [];
  const adapter = new HttpNetBoxClient({ baseUrl: 'https://netbox.example', token, fetch: async (url, init) => { assert.equal(init?.method, 'GET'); const key = new URL(String(url)).pathname + new URL(String(url)).search; seen.push(key); return new Response(JSON.stringify(responses[key] ?? {}), { status: responses[key] ? 200 : 404 }); } });
  const result = await adapter.getPowerPath({ id: 7 });
  assert.equal(result.redundancy, 'a-b-evidenced');
  assert.deepEqual(result.powerPorts.map((port) => port.connection?.upstreamPowerFeed?.name), ['FEED-A', 'FEED-B']);
  assert.ok(seen.every((path) => path.startsWith('/api/dcim/')));
});
