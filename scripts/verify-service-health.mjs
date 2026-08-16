import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const trace = 'dtr_at14_service_health_v1';
const correlationId = `at14-${new Date().toISOString().replace(/[-:.]/g, '')}`;
const checks = [];

async function http(id, layer, url, dependency) {
  const started = performance.now();
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const passed = response.status >= 200 && response.status < 400;
    checks.push({ id, layer, mechanism: 'http-readiness', dependency, result: passed ? 'passed' : 'failed', statusCode: response.status, latencyMs: Math.round(performance.now() - started) });
  } catch {
    checks.push({ id, layer, mechanism: 'http-readiness', dependency, result: 'failed', statusCode: null, latencyMs: Math.round(performance.now() - started) });
  }
}

function command(id, layer, file, args, dependency, mechanism) {
  const started = performance.now();
  try {
    execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 });
    checks.push({ id, layer, mechanism, dependency, result: 'passed', latencyMs: Math.round(performance.now() - started) });
  } catch {
    checks.push({ id, layer, mechanism, dependency, result: 'failed', latencyMs: Math.round(performance.now() - started) });
  }
}

function dockerHealth(id, container, dependency) {
  const started = performance.now();
  try {
    const status = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', container], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).trim();
    checks.push({ id, layer: 'docker', mechanism: 'docker-healthcheck', dependency, result: status === 'healthy' ? 'passed' : 'failed', status, latencyMs: Math.round(performance.now() - started) });
  } catch {
    checks.push({ id, layer: 'docker', mechanism: 'docker-healthcheck', dependency, result: 'failed', status: 'unavailable', latencyMs: Math.round(performance.now() - started) });
  }
}

for (const [id, container, dependency] of [
  ['netbox-postgres', 'enterprise-mcp-kit-demo-postgres-1', 'local Docker storage'],
  ['netbox-valkey', 'enterprise-mcp-kit-demo-redis-1', 'local Docker storage'],
  ['netbox-valkey-cache', 'enterprise-mcp-kit-demo-redis-cache-1', 'local Docker storage'],
  ['netbox-worker', 'enterprise-mcp-kit-demo-netbox-worker-1', 'NetBox, PostgreSQL, Valkey'],
  ['zabbix-postgres', 'enterprise-aiops-zabbix-postgres-1', 'local Docker storage'],
]) dockerHealth(id, container, dependency);

await Promise.all([
  http('netbox-web', 'docker', 'http://127.0.0.1:8000/login/', 'NetBox PostgreSQL and Valkey'),
  http('keycloak', 'docker', 'http://127.0.0.1:8081/realms/master', 'Keycloak local database'),
  http('zabbix-web', 'docker', 'http://127.0.0.1:8080/', 'Zabbix Server and PostgreSQL'),
  http('prometheus', 'docker', 'http://127.0.0.1:9090/-/ready', 'Prometheus local TSDB'),
  http('grafana', 'docker', 'http://127.0.0.1:3000/api/health', 'Grafana database and provisioned datasources'),
  http('cloud-event-nats', 'docker', 'http://127.0.0.1:8222/healthz?js-enabled-only=true', 'NATS JetStream storage'),
  http('cloud-event-api', 'docker', 'http://127.0.0.1:8790/readyz', 'NATS JetStream'),
  http('cloud-event-worker', 'docker', 'http://127.0.0.1:8791/readyz', 'NATS JetStream'),
  http('gitlab', 'docker', 'http://127.0.0.1:8929/users/sign_in', 'GitLab internal PostgreSQL, Redis, Gitaly, Puma'),
  http('wireguard-observer', 'systemd', 'http://127.0.0.1:9108/health', 'WireGuard network namespaces'),
  http('kubernetes-cpu-observer', 'systemd', 'http://127.0.0.1:9109/health', 'K3s Metrics API'),
  http('cloud-reference-review', 'systemd', 'http://127.0.0.1:30080/', 'LAS Kubernetes Service'),
]);

command('zabbix-server', 'docker', 'docker', ['exec', 'enterprise-aiops-zabbix-server-1', '/usr/sbin/zabbix_server', '-R', 'diaginfo'], 'Zabbix PostgreSQL', 'native-runtime-diagnostic');
command('gitlab-runner', 'docker', 'docker', ['exec', 'enterprise-aiops-gitlab-runner-1', 'gitlab-runner', 'verify'], 'GitLab API', 'native-runner-verification');
for (const [id, namespace, deployment, dependency] of [
  ['k3s-las-workload', 'cloud-reference', 'cloud-reference', 'K3s, CoreDNS, Traefik'],
  ['k3s-chi-workload', 'cloud-reference-chi', 'cloud-reference', 'K3s, CoreDNS, Traefik'],
  ['k3s-coredns', 'kube-system', 'coredns', 'K3s control plane'],
  ['k3s-metrics-server', 'kube-system', 'metrics-server', 'K3s API'],
  ['k3s-traefik', 'kube-system', 'traefik', 'K3s API and networking'],
  ['k3s-local-path-provisioner', 'kube-system', 'local-path-provisioner', 'K3s API and local storage'],
]) command(id, 'kubernetes', 'k3s', ['kubectl', '-n', namespace, 'rollout', 'status', `deployment/${deployment}`, '--timeout=5s'], dependency, 'kubernetes-rollout-readiness');

checks.sort((a, b) => a.id.localeCompare(b.id));
const failed = checks.filter((check) => check.result !== 'passed');
const evidence = {
  schemaVersion: 1,
  acceptanceTest: 'AT-14',
  result: failed.length === 0 ? 'passed' : 'non-success',
  observedAt: new Date().toISOString(),
  correlationId,
  decisionTraceId: trace,
  scope: 'installed-open-enterprise-aiops-lab-services',
  summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  checks,
  failures: failed.map((check) => check.id),
  claimsBoundary: 'Point-in-time readiness coverage on one shared WSL host. Recovery claims require separate failure-injection evidence.',
};
const canonical = JSON.stringify(evidence);
const artifactSha256 = createHash('sha256').update(canonical).digest('hex');
const output = { ...evidence, artifactSha256 };
fs.mkdirSync('delivery-evidence/service-health', { recursive: true, mode: 0o700 });
fs.writeFileSync('delivery-evidence/service-health/latest.json', `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ result: output.result, total: output.summary.total, passed: output.summary.passed, failed: output.summary.failed, correlationId, decisionTraceId: trace, artifactSha256, evidencePath: 'delivery-evidence/service-health/latest.json' }));
if (failed.length) process.exitCode = 1;
