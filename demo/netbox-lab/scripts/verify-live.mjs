import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { HttpNetBoxClient } from '../../../dist/src/netbox-client.js';

const required = [
  'NETBOX_BASE_URL',
  'NETBOX_TOKEN',
  'NETBOX_DEMO_DEVICE',
  'NETBOX_DEMO_DEVICE_ID',
];
for (const name of required) {
  assert.ok(process.env[name], `Missing ${name}.`);
}

const baseUrl = process.env.NETBOX_BASE_URL;
const token = process.env.NETBOX_TOKEN;
const deviceName = process.env.NETBOX_DEMO_DEVICE;
const deviceId = Number(process.env.NETBOX_DEMO_DEVICE_ID);
const timeoutMs = Number(process.env.NETBOX_TIMEOUT_MS ?? '5000');

const adapter = new HttpNetBoxClient({ baseUrl, token, timeoutMs });
const byName = await adapter.getDeviceContext({ name: deviceName });
const byId = await adapter.getDeviceContext({ id: deviceId });

assert.equal(byName.id, deviceId);
assert.equal(byName.name, deviceName);
assert.equal(byName.status, 'active');
assert.equal(byName.site, 'Phoenix Lab');
assert.equal(byName.role, 'Edge Router');
assert.equal(byName.deviceType, 'Edge Router 1000');
assert.deepEqual(byId, byName);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/src/server.js'],
  cwd: new URL('../../..', import.meta.url).pathname,
  env: {
    ...process.env,
    NETBOX_BASE_URL: baseUrl,
    NETBOX_TOKEN: token,
    NETBOX_TIMEOUT_MS: String(timeoutMs),
  },
  stderr: 'pipe',
});
const client = new Client({ name: 'enterprise-mcp-kit-live-proof', version: '0.1.0' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['get_connectivity_path', 'get_device_context', 'get_power_path', 'get_rack_context', 'get_site_overview']);

  const result = await client.callTool({
    name: 'get_device_context',
    arguments: { name: deviceName },
  });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, byName);

  const site = await client.callTool({
    name: 'get_site_overview',
    arguments: { name: 'Phoenix Lab' },
  });
  assert.notEqual(site.isError, true);
  assert.equal(site.structuredContent.name, 'Phoenix Lab');
  assert.ok(site.structuredContent.deviceCount >= 1);
  assert.equal(site.structuredContent.truncated, false);

  const missing = await client.callTool({
    name: 'get_device_context',
    arguments: { name: 'does-not-exist' },
  });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /not found/i);
  assert.doesNotMatch(missing.content[0].text, new RegExp(token));
} finally {
  await client.close();
}

console.log(JSON.stringify({
  result: 'passed',
  tool: 'get_device_context',
  lookup: { name: byName.name, id: byName.id },
  approvedFields: Object.keys(byName),
  siteTool: 'get_site_overview',
  device: {
    status: byName.status,
    site: byName.site,
    role: byName.role,
    deviceType: byName.deviceType,
  },
  credential: 'dedicated read-only NetBox token',
}, null, 2));
