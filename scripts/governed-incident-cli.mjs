import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AnsibleObserverExecutor, GovernedIncidentWorkflow } from '../dist/src/aiops-incident.js';
import { resolveVerifiedOidcActor } from '../dist/src/governance-identity.js';
import { OidcJwksVerifier } from '../dist/src/oidc-jwks.js';

const run = promisify(execFile);
const runtimeDir = 'demo/governed-incident/.runtime';
const pendingPath = `${runtimeDir}/pending-plan.json`;
const proofPath = `${runtimeDir}/latest-proof.json`;
const issuer = process.env.AIOPS_OIDC_ISSUER ?? 'http://127.0.0.1:8081/realms/enterprise-mcp-kit';
const audience = process.env.AIOPS_OIDC_AUDIENCE ?? 'enterprise-mcp-kit';
const verifier = new OidcJwksVerifier({ issuer, audience, jwksUrl: `${issuer}/protocol/openid-connect/certs`, allowInsecureLoopback: true });

if (process.argv.includes('--prepare')) await prepare();
else if (process.argv.includes('--approve-and-execute')) await approveAndExecute();
else throw new Error('Choose --prepare or --approve-and-execute.');

async function prepare() {
  if (!process.argv.includes('--inject-observer-failure')) throw new Error('Prepare requires explicit --inject-observer-failure.');
  const planner = await authenticatedActor('AIOPS_PLANNER_TOKEN', 'planner');
  await run('/usr/bin/systemctl', ['stop', 'aiops-wireguard-observer.service']);
  await new Promise((resolve) => setTimeout(resolve, 12_000));
  const prometheus = await fetch('http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22wireguard-two-site%22%7D').then((response) => response.json());
  const value = prometheus.data?.result?.[0]?.value?.[1];
  const observedAt = new Date().toISOString();
  const evidence = [
    { source: 'systemd', observedAt, healthy: false, summary: 'The fixed observer systemd unit is inactive after deliberate failure injection.', decisionTraceId: 'dtr_wireguard_netns_v1' },
    { source: 'prometheus', observedAt, healthy: value === '1', summary: `Prometheus target availability is ${value ?? 'absent'} after the observer failure.`, decisionTraceId: 'dtr_wireguard_netns_v1' },
  ];
  const workflow = new GovernedIncidentWorkflow(new AnsibleObserverExecutor());
  const plan = await workflow.plan(planner, { expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), confidence: 0.95, promptVersion: 'incident-explainer-v1', evidence });
  await writePrivate(pendingPath, plan);
  console.log(JSON.stringify({ result: 'awaiting-human-approval', planId: plan.id, approvalDigest: plan.approvalDigest, expiresAt: plan.expiresAt, action: plan.action, target: plan.target, evidence: plan.evidence, pendingPath }));
}

async function approveAndExecute() {
  const planId = argument('--plan-id');
  const digest = argument('--approval-digest');
  const reason = argument('--reason');
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Approval digest must be exactly 64 lowercase hexadecimal characters.');
  const approver = await authenticatedActor('AIOPS_APPROVER_TOKEN', 'approver');
  const executor = await authenticatedActor('AIOPS_EXECUTOR_TOKEN', 'executor');
  let plan = JSON.parse(await fs.readFile(pendingPath, 'utf8'));
  if (plan.id !== planId || plan.approvalDigest !== digest) throw new Error('Plan ID or digest does not match the pending reviewed plan.');
  const workflow = new GovernedIncidentWorkflow(new AnsibleObserverExecutor());
  plan = workflow.approve(approver, plan, reason, digest);
  plan = await workflow.execute(executor, plan);
  if (plan.state !== 'verified') throw new Error(`Execution did not verify: ${plan.state}`);
  plan = await workflow.recordRollback(executor, plan, 'Restart changed no configuration; recorded active state and healthy outcome remain restored.');
  await writePrivate(proofPath, plan);
  await fs.unlink(pendingPath);
  console.log(JSON.stringify({ result: 'passed', planId: plan.id, state: plan.state, approvalDigest: plan.approvalDigest, approvedBy: plan.approvedBy, beforePid: plan.outcome?.beforePid, afterPid: plan.outcome?.afterPid, events: plan.audit.map((item) => item.event), proofPath }));
}

async function authenticatedActor(environmentName, requiredRole) {
  const token = process.env[environmentName];
  if (!token) throw new Error(`${environmentName} is required and is never persisted.`);
  const claims = await verifier.verify(token);
  const actor = resolveVerifiedOidcActor(claims, { issuer, audience });
  if (!actor.roles.includes(requiredRole)) throw new Error(`Authenticated actor lacks required ${requiredRole} role.`);
  return actor;
}

async function writePrivate(path, value) {
  const repositoryOwner = await fs.stat('.');
  await fs.mkdir(runtimeDir, { recursive: true });
  if (process.getuid?.() === 0) await fs.chown(runtimeDir, repositoryOwner.uid, repositoryOwner.gid);
  await fs.chmod(runtimeDir, 0o700);
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.getuid?.() === 0) await fs.chown(path, repositoryOwner.uid, repositoryOwner.gid);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} requires an exact value.`);
  return value;
}
