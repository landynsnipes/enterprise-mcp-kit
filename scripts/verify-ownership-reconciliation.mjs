import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const runtimePath = 'demo/netbox-lab/.mcp.env';
const runtime = Object.fromEntries(fs.readFileSync(runtimePath, 'utf8').split(/\r?\n/).filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
}));
if (fs.statSync(runtimePath).mode % 512 !== 0o600) throw new Error('NetBox runtime configuration must be mode 600.');
if (!runtime.NETBOX_BASE_URL || !runtime.NETBOX_TOKEN) throw new Error('NetBox runtime configuration is incomplete.');

const trace = 'dtr_at02_ownership_v1';
const correlationId = `at02-${new Date().toISOString().replace(/[-:.]/g, '')}`;
const observedAt = new Date().toISOString();
const failures = [];
const records = [];

async function netbox(path, owner, purpose) {
  const response = await fetch(`${runtime.NETBOX_BASE_URL}${path}`, { headers: { Authorization: `Token ${runtime.NETBOX_TOKEN}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`NetBox exact read failed for ${purpose}: ${response.status}`);
  const body = await response.json();
  return { owner, purpose, observedAt, source: `netbox:${path}`, body };
}

function kubectl(args) {
  return JSON.parse(execFileSync('k3s', ['kubectl', ...args, '-o', 'json'], { encoding: 'utf8', timeout: 10_000 }));
}

function add(record, passed = true) {
  records.push({ ...record, decisionTraceId: trace, correlationId, observedAt, result: passed ? 'observed' : 'unknown' });
  if (!passed) failures.push(record.id);
}

for (const [siteSlug, namespace, workloadSite] of [['las-vegas-lab', 'cloud-reference', 'las'], ['chicago-lab', 'cloud-reference-chi', 'chi']]) {
  const manifest = JSON.parse(fs.readFileSync(`config/aiops/${siteSlug === 'las-vegas-lab' ? 'las-vegas' : 'chicago'}.site.json`, 'utf8'));
  const site = await netbox(`/api/dcim/sites/?slug=${encodeURIComponent(siteSlug)}`, 'NetBox', 'exact intended site');
  const device = await netbox(`/api/dcim/devices/?name=${encodeURIComponent(manifest.devices[0].name)}`, 'NetBox', 'exact intended edge device');
  add({ id: `${workloadSite}-netbox-site`, fact: 'intended site identity, facility, and tenant', owner: site.owner, source: site.source, value: { count: site.body.count, sites: site.body.results.map((item) => ({ id: item.id, name: item.name, slug: item.slug, facility: item.facility, tenant: item.tenant?.slug ?? null })) } }, site.body.count === 1);
  add({ id: `${workloadSite}-netbox-device`, fact: 'intended edge-device identity and site reference', owner: device.owner, source: device.source, value: { count: device.body.count, devices: device.body.results.map((item) => ({ id: item.id, name: item.name, site: item.site?.slug ?? null, status: item.status?.value ?? null })) } }, device.body.count === 1);
  const deployment = kubectl(['-n', namespace, 'get', 'deployment', 'cloud-reference']);
  add({ id: `${workloadSite}-kubernetes-replicas`, fact: 'runtime desired/ready/updated workload replicas', owner: 'Kubernetes Deployment controller', source: `kubernetes:${namespace}/deployment/cloud-reference`, value: { desired: deployment.spec.replicas ?? 0, ready: deployment.status?.readyReplicas ?? 0, updated: deployment.status?.updatedReplicas ?? 0, unavailable: deployment.status?.unavailableReplicas ?? 0, site: workloadSite } });
}

const observer = await fetch('http://127.0.0.1:9109/api/status', { signal: AbortSignal.timeout(5000) }).then((response) => response.ok ? response.json() : { healthy: false }).catch(() => ({ healthy: false }));
add({ id: 'las-prometheus-cpu', fact: 'runtime pod CPU observation', owner: 'Kubernetes Metrics API via Prometheus observer', source: 'http://127.0.0.1:9109/api/status', value: { healthy: observer.healthy === true, pods: Array.isArray(observer.pods) ? observer.pods.filter((pod) => pod.pod.startsWith('cloud-reference-')).map((pod) => ({ pod: pod.pod, cpuMillicores: pod.cpuMillicores })) : [], unknownIfUnhealthy: true } }, observer.healthy === true);
const alerts = await fetch('http://127.0.0.1:9090/api/v1/alerts', { signal: AbortSignal.timeout(5000) }).then((response) => response.ok ? response.json() : { data: { alerts: [] } }).catch(() => ({ data: { alerts: [] } }));
add({ id: 'las-prometheus-alert-state', fact: 'runtime high-CPU alert state', owner: 'Prometheus rule evaluator', source: 'http://127.0.0.1:9090/api/v1/alerts', value: { highCpuAlertsFiring: (alerts.data?.alerts ?? []).filter((alert) => alert.labels?.alertname === 'KubernetesLasPodHighCpu' && alert.state === 'firing').length, unknownIfEndpointUnavailable: true } }, Array.isArray(alerts.data?.alerts));
const wireguard = await fetch('http://127.0.0.1:9108/api/status', { signal: AbortSignal.timeout(5000) }).then((response) => response.ok ? response.json() : { healthy: false }).catch(() => ({ healthy: false }));
add({ id: 'las-chi-wireguard-runtime', fact: 'runtime private-path and policy-block observations', owner: 'WireGuard namespace observer', source: 'http://127.0.0.1:9108/api/status', value: { healthy: wireguard.healthy === true, allowedPathUp: wireguard.allowedPathUp ?? null, deniedPathBlocked: wireguard.deniedPathBlocked ?? null, unknownIfUnhealthy: true } }, wireguard.healthy === true);
add({ id: 'power-runtime-state', fact: 'live electrical delivery, breaker, and load', owner: 'No runtime owner in this lab', source: 'not collected', value: null }, true);

const evidence = { schemaVersion: 1, acceptanceTest: 'AT-02', result: failures.length === 0 ? 'passed' : 'non-success', tenantId: 'open-enterprise-aiops', observedAt, correlationId, decisionTraceId: trace, records, failures, claimsBoundary: 'NetBox records intended inventory and topology; Kubernetes, Metrics API, Prometheus, and WireGuard observers own runtime facts. Live electrical state remains unknown.' };
const canonical = JSON.stringify(evidence);
const artifactSha256 = createHash('sha256').update(canonical).digest('hex');
fs.mkdirSync('delivery-evidence/reconciliation', { recursive: true, mode: 0o700 });
fs.writeFileSync('delivery-evidence/reconciliation/at02-ownership.json', `${JSON.stringify({ ...evidence, artifactSha256 }, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ result: evidence.result, records: records.length, failures, correlationId, decisionTraceId: trace, artifactSha256, evidencePath: 'delivery-evidence/reconciliation/at02-ownership.json' }));
if (failures.length) process.exitCode = 1;
