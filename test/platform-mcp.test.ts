import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LocalAnsibleExecutor } from '../src/ansible-executor.js';
import { HttpGrafanaClient } from '../src/grafana-client.js';
import { createGrafanaMcpServer } from '../src/grafana-mcp.js';
import { HttpKubernetesClient } from '../src/kubernetes-client.js';
import { createKubernetesAnsibleMcpServer } from '../src/kubernetes-ansible-mcp.js';
import { HttpOpnSenseClient } from '../src/opnsense-client.js';
import { createOpnSenseMcpServer } from '../src/opnsense-mcp.js';
import { HttpWireGuardClient } from '../src/wireguard-client.js';
import { createWireGuardMcpServer } from '../src/wireguard-mcp.js';
import { HttpZabbixClient } from '../src/zabbix-client.js';
import { createZabbixMcpServer } from '../src/zabbix-mcp.js';

const token = 'test-token';
async function withServer(serverFactory: () => { connect(transport: unknown): Promise<void>; close(): Promise<void> }, run: (client: Client) => Promise<void>) {
  const server = serverFactory();
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try { await run(client); } finally { await client.close(); await server.close(); }
}

test('Grafana reads a dashboard and pauses one alert rule after expected-state checks', async () => {
  const rule = { uid: 'cpu-high', title: 'CPU high', folderUID: 'ops', isPaused: false, updated: '2026-08-15T00:00:00Z', provenance: 'file' };
  const grafana = new HttpGrafanaClient({
    baseUrl: 'https://grafana.example', token, fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === '/api/dashboards/uid/k8s-las') return new Response(JSON.stringify({ meta: { folderTitle: 'AIOps', url: '/d/k8s-las' }, dashboard: { uid: 'k8s-las', title: 'LAS Workload', tags: ['aiops'], version: 3 } }));
      if (path === '/api/v1/provisioning/alert-rules/cpu-high' && init?.method === 'GET') return new Response(JSON.stringify(rule));
      if (path === '/api/v1/provisioning/alert-rules/cpu-high' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { isPaused: boolean };
        assert.equal(body.isPaused, true);
        return new Response(JSON.stringify({ ...rule, isPaused: true }));
      }
      return new Response('{}', { status: 404 });
    },
  });
  await withServer(() => createGrafanaMcpServer(grafana, { enableWrites: true }), async (client) => {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['get_alert_rule_context', 'get_dashboard_context', 'set_alert_rule_paused']);
    const dashboard = await client.callTool({ name: 'get_dashboard_context', arguments: { uid: 'k8s-las' } }) as any;
    assert.notEqual(dashboard.isError, true);
    assert.equal(dashboard.structuredContent.title, 'LAS Workload');
    const paused = await client.callTool({ name: 'set_alert_rule_paused', arguments: { uid: 'cpu-high', expectedPaused: false, paused: true } }) as any;
    assert.notEqual(paused.isError, true);
    assert.equal(paused.structuredContent.afterPaused, true);
  });
});

test('Zabbix reads an exact host and acknowledges one problem', async () => {
  let acknowledged = false;
  const zabbix = new HttpZabbixClient({
    baseUrl: 'https://zabbix.example', token, fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
      if (body.method === 'host.get') return new Response(JSON.stringify({ jsonrpc: '2.0', result: [{ hostid: '101', host: 'aiops-las-edge-01', name: 'LAS edge', status: '0', inventory: { os: 'Ubuntu' } }], id: 1 }));
      if (body.method === 'problem.get') return new Response(JSON.stringify({ jsonrpc: '2.0', result: [{ eventid: '77', name: 'Observer down', severity: '4', acknowledged: acknowledged ? '1' : '0', clock: '1710000000', hosts: [{ host: 'aiops-las-edge-01' }] }], id: 2 }));
      if (body.method === 'event.acknowledge') { acknowledged = true; return new Response(JSON.stringify({ jsonrpc: '2.0', result: { eventids: ['77'] }, id: 3 })); }
      return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: 'bad' }, id: 0 }));
    },
  });
  await withServer(() => createZabbixMcpServer(zabbix, { enableWrites: true }), async (client) => {
    const host = await client.callTool({ name: 'get_host_context', arguments: { host: 'aiops-las-edge-01' } }) as any;
    assert.equal(host.structuredContent.status, 'enabled');
    const ack = await client.callTool({ name: 'acknowledge_problem', arguments: { eventId: 77, message: 'Operator acknowledged.', expectedAcknowledged: false } }) as any;
    assert.notEqual(ack.isError, true);
    assert.equal(ack.structuredContent.afterAcknowledged, true);
  });
});

test('WireGuard reads one interface and restarts only admitted interfaces', async () => {
  const status = { listenPort: 51820, peers: [{ publicKeyFingerprint: 'sha256:abc', endpoint: '203.0.113.10:51820', allowedIps: ['10.10.0.0/24'], latestHandshakeSeconds: 12, transferRx: 1, transferTx: 1 }] };
  const wireguard = new HttpWireGuardClient({
    baseUrl: 'https://wg.example',
    admittedInterfaces: ['wg0'],
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === '/api/interfaces/wg0' && (init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify(status));
      if (path === '/api/interfaces/wg0/restart' && init?.method === 'POST') return new Response(JSON.stringify({ ok: true }));
      return new Response('{}', { status: 404 });
    },
  });
  await withServer(() => createWireGuardMcpServer(wireguard, { enableWrites: true }), async (client) => {
    const before = await client.callTool({ name: 'get_interface_status', arguments: { interface: 'wg0' } }) as any;
    assert.equal(before.structuredContent.peerCount, 1);
    const restart = await client.callTool({ name: 'restart_interface', arguments: { interface: 'wg0' } }) as any;
    assert.notEqual(restart.isError, true);
    assert.equal(restart.structuredContent.changed, true);
    const denied = await client.callTool({ name: 'get_interface_status', arguments: { interface: 'wg1' } }) as any;
    assert.equal(denied.isError, true);
  });
});

test('Kubernetes scales an admitted deployment and Ansible rejects unknown playbooks', async () => {
  let replicas = 1;
  let resourceVersion = '100';
  const kubernetes = new HttpKubernetesClient({
    baseUrl: 'https://kubernetes.example', token, fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      assert.equal(path, '/apis/apps/v1/namespaces/cloud-reference/deployments/demo');
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { spec: { replicas: number }; metadata: { resourceVersion: string } };
        assert.equal(body.metadata.resourceVersion, '100');
        replicas = body.spec.replicas;
        resourceVersion = '101';
      }
      return new Response(JSON.stringify({ metadata: { name: 'demo', resourceVersion }, spec: { replicas }, status: { readyReplicas: replicas } }));
    },
  });
  await withServer(() => createKubernetesAnsibleMcpServer(kubernetes, new LocalAnsibleExecutor({ playbooks: { 'site-restart': '/opt/ansible/site-restart.yml' } }), { enableWrites: true }), async (client) => {
    const scaled = await client.callTool({ name: 'set_workload_replicas', arguments: { namespace: 'cloud-reference', name: 'demo', expectedReplicas: 1, replicas: 2, expectedResourceVersion: '100' } }) as any;
    assert.notEqual(scaled.isError, true);
    assert.equal(scaled.structuredContent.afterReplicas, 2);
    const rejected = await client.callTool({ name: 'run_admitted_playbook', arguments: { playbookId: 'rm-rf', mode: 'apply' } }) as any;
    assert.equal(rejected.isError, true);
    assert.doesNotMatch(rejected.content[0].text, /test-token/);
  });
});

test('OPNsense reads an alias and toggles it after expected-state checks', async () => {
  let enabled = true;
  const opnsense = new HttpOpnSenseClient({
    baseUrl: 'https://opnsense.example', key: 'key', secret: 'secret', fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.includes('toggleItem') && init?.method === 'POST') { enabled = !enabled; return new Response(JSON.stringify({ result: 'ok' })); }
      if (path.includes('getItem')) return new Response(JSON.stringify({ alias: { name: 'lab-allow', enabled, type: 'host' } }));
      return new Response('{}', { status: 404 });
    },
  });
  await withServer(() => createOpnSenseMcpServer(opnsense, { enableWrites: true }), async (client) => {
    const before = await client.callTool({ name: 'get_alias_context', arguments: { uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } }) as any;
    assert.equal(before.structuredContent.enabled, true);
    const toggled = await client.callTool({ name: 'toggle_alias', arguments: { uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', expectedEnabled: true } }) as any;
    assert.notEqual(toggled.isError, true);
    assert.equal(toggled.structuredContent.afterEnabled, false);
  });
});
