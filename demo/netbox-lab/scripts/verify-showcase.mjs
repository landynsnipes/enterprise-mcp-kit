import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

for (const name of ['NETBOX_BASE_URL', 'NETBOX_TOKEN']) {
  assert.ok(process.env[name], `Missing ${name}.`);
}

const expected = [
  ['ns-phx-edge-01', 'Northstar Phoenix DC1', 'Northstar Financial'],
  ['sum-cloud-edge-01', 'Summit Cloud Edge', 'Summit Digital'],
  ['atlas-core-01', 'Atlas Colo West', 'Atlas Managed Services'],
];
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/src/server.js'],
  cwd: new URL('../../..', import.meta.url).pathname,
  env: { ...process.env },
  stderr: 'pipe',
});
const client = new Client({ name: 'enterprise-mcp-kit-showcase-proof', version: '0.1.0' });

try {
  await client.connect(transport);
  for (const [name, site] of expected) {
    const result = await client.callTool({
      name: 'get_device_context',
      arguments: { name },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.name, name);
    assert.equal(result.structuredContent.site, site);
    assert.ok(result.structuredContent.primaryIpv4);
    assert.ok(result.structuredContent.platform);
    assert.ok(result.structuredContent.observedSoftwareVersion);
    assert.ok(result.structuredContent.minimumApprovedVersion);
    assert.equal(result.structuredContent.versionCompliance, 'meets-example-policy');
    assert.equal(result.structuredContent.versionEvidenceSource, 'sanitized-lab-seed');
    assert.ok(result.structuredContent.versionObservedAt);
  }
  const siteOverview = await client.callTool({
    name: 'get_site_overview',
    arguments: { name: 'Northstar Phoenix DC1' },
  });
  assert.notEqual(siteOverview.isError, true);
  assert.equal(siteOverview.structuredContent.name, 'Northstar Phoenix DC1');
  assert.ok(siteOverview.structuredContent.deviceCount >= 9);
  assert.ok(siteOverview.structuredContent.rackCount >= 2);
  assert.ok(siteOverview.structuredContent.activeCircuitCount >= 1);
  assert.ok(siteOverview.structuredContent.contactAssignmentCount >= 1);
  assert.equal(siteOverview.structuredContent.softwareNonCompliantCount, 0);
  assert.ok(siteOverview.structuredContent.softwareCompliantCount >= 9);
  assert.equal(siteOverview.structuredContent.truncated, false);
  const connectivity = await client.callTool({
    name: 'get_connectivity_path',
    arguments: { fromSite: 'Northstar Phoenix DC1', toSite: 'Northstar Reno DR' },
  });
  assert.notEqual(connectivity.isError, true);
  assert.equal(connectivity.structuredContent.completeness, 'direct-evidence');
  assert.ok(connectivity.structuredContent.segments.some((segment) => segment.kind === 'circuit' && segment.name === 'EX-NS-DR-001'));
  assert.ok(connectivity.structuredContent.segments.some((segment) => segment.kind === 'vpn' && segment.name === 'northstar-phoenix-to-reno'));
  assert.match(connectivity.structuredContent.unknowns.join(' '), /does not prove/i);
  const rack = await client.callTool({
    name: 'get_rack_context',
    arguments: { site: 'Northstar Phoenix DC1', name: 'PHX-A01' },
  });
  assert.notEqual(rack.isError, true);
  assert.equal(rack.structuredContent.heightUnits, 42);
  assert.equal(rack.structuredContent.deviceCount, 5);
  assert.equal(rack.structuredContent.powerFeedCount, 4);
  assert.ok(rack.structuredContent.devices.some((device) => device.name === 'ns-phx-edge-01' && device.position === 42));
  assert.equal(rack.structuredContent.truncated, false);
  const power = await client.callTool({
    name: 'get_power_path',
    arguments: { name: 'ns-phx-edge-01' },
  });
  assert.notEqual(power.isError, true);
  assert.equal(power.structuredContent.redundancy, 'a-b-evidenced');
  assert.equal(power.structuredContent.powerPorts.length, 2);
  assert.ok(power.structuredContent.powerPorts.every((port) => port.connection?.upstreamPowerFeed));
  assert.deepEqual(power.structuredContent.powerPorts.map((port) => port.connection.upstreamPowerFeed.name).sort(), ['PHX-A01-FEED-A', 'PHX-A01-FEED-B']);
  assert.match(power.structuredContent.unknowns.join(' '), /does not prove live electrical state/i);
} finally {
  await client.close();
}

console.log(JSON.stringify({
  result: 'passed',
  tool: 'get_device_context',
  scenarios: expected.map(([device, site, organization]) => ({
    organization,
    device,
    site,
  })),
  softwareProof: {
    device: 'ns-phx-edge-01',
    platform: 'Example Network OS',
    observedVersion: '12.4.3',
    minimumApprovedVersion: '12.4.0',
    compliance: 'meets-example-policy',
    evidenceSource: 'sanitized-lab-seed',
  },
  siteOverviewProof: {
    site: 'Northstar Phoenix DC1',
    evidence: ['devices', 'racks', 'active circuits', 'contacts', 'software compliance'],
  },
  connectivityProof: {
    from: 'Northstar Phoenix DC1',
    to: 'Northstar Reno DR',
    evidence: ['private WAN circuit', 'IPsec tunnel'],
    boundary: 'does not claim runtime routing or forwarding state',
  },
  rackProof: {
    rack: 'PHX-A01',
    site: 'Northstar Phoenix DC1',
    evidence: ['rack dimensions', 'device elevation', 'power-feed count', 'software posture'],
  },
  powerPathProof: {
    device: 'ns-phx-edge-01',
    evidence: ['PSU-A to PDU outlet A-02 to PHX-A01-FEED-A', 'PSU-B to PDU outlet B-02 to PHX-A01-FEED-B'],
    boundary: 'does not claim live electrical state, load, breaker state, or power delivery',
  },
  boundary: 'read-only exact device context',
}, null, 2));
