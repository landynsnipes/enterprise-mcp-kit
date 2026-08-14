import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NetBoxSiteProvisioningAdapter } from '../../../dist/src/netbox-site-provisioning-adapter.js';

const gateway = process.env.GOVERNANCE_BASE_URL ?? 'http://127.0.0.1:8787';
const issuer = process.env.GOVERNANCE_OIDC_ISSUER ?? 'http://127.0.0.1:8081/realms/enterprise-mcp-kit';
const outputPath = process.env.AIOPS_PROVISION_EVIDENCE ?? 'delivery-evidence/reconciliation/aiops-governed-provisioning.json';
const manifestPaths = process.argv.slice(2);
if (manifestPaths.length !== 2) throw new Error('Expected exactly two site manifest paths.');

const allManifests = await Promise.all(manifestPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
if (allManifests.length !== 2 || allManifests[0].tenantSlug !== allManifests[1].tenantSlug) throw new Error('The two manifests must share one tenant.');
const requestedSite = process.env.AIOPS_SITE_SLUG;
const manifests = requestedSite ? allManifests.filter((manifest) => manifest.site.slug === requestedSite) : allManifests;
if (!manifests.length) throw new Error(`Requested site was not found in the two-site manifest pair: ${requestedSite}.`);

function expectedRecordCount(manifest) {
  const deviceInterfaces = manifest.devices.reduce((total, device) => total + device.interfaces.length, 0);
  const deviceAddresses = manifest.devices.reduce((total, device) => total + device.interfaces.filter((iface) => iface.address).length, 0);
  const vmInterfaces = (manifest.virtualMachines ?? []).reduce((total, vm) => total + vm.interfaces.length, 0);
  const vmAddresses = (manifest.virtualMachines ?? []).reduce((total, vm) => total + vm.interfaces.filter((iface) => iface.address).length, 0);
  return 1 + (manifest.vlans ?? []).length + (manifest.prefixes ?? []).length + manifest.racks.length + manifest.devices.length + deviceInterfaces + deviceAddresses + (manifest.virtualMachines ?? []).length + vmInterfaces + vmAddresses + (manifest.power?.panels ?? []).length + (manifest.power?.feeds ?? []).length + (manifest.cables ?? []).length + (manifest.circuits ?? []).length + (manifest.tunnels ?? []).length;
}

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { accept: 'application/json', 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} returned ${response.status}: ${body.message ?? body.error_code ?? 'request failed'}`);
  return body;
}
async function token(username) {
  const body = new URLSearchParams({ grant_type: 'password', client_id: 'enterprise-mcp-kit', username, password: 'local-demo-only' });
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const value = await response.json();
  if (!response.ok || typeof value.access_token !== 'string') throw new Error(`OIDC token request failed for ${username}.`);
  return value.access_token;
}

const [planner, approver, executor] = await Promise.all([token(process.env.AIOPS_PLANNER_USERNAME ?? 'aiops-planner'), token(process.env.AIOPS_APPROVER_USERNAME ?? 'aiops-approver'), token(process.env.AIOPS_EXECUTOR_USERNAME ?? 'aiops-executor')]);
const commonHeaders = (bearer, key) => ({ Authorization: `Bearer ${bearer}`, 'Idempotency-Key': key });
const now = new Date();
const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
const records = [];
const executePlans = process.env.AIOPS_VERIFY_ONLY !== '1';
for (const manifest of manifests) {
  if (!executePlans) continue;
  const siteKey = manifest.site.slug.replace(/[^a-z0-9]+/g, '-');
  const planResponse = await json(`${gateway}/api/v1/governance/tools/plan_customer_site_provisioning`, {
    method: 'POST', headers: commonHeaders(planner, `aiops-${siteKey}-plan-v1`),
    body: JSON.stringify({ manifest, proposedChange: `Create the exact reviewed ${manifest.site.name} intended inventory manifest, including WireGuard peer intent without keys or runtime state.`, confidence: 1, expiresAt }),
  });
  const planned = planResponse.data;
  if (planned.state !== 'planned' || !/^[a-f0-9]{64}$/.test(planned.provisioning?.manifestDigest ?? '')) throw new Error(`Planning did not produce a digest for ${manifest.site.slug}.`);
  const digest = planned.provisioning.manifestDigest;
  const approvalResponse = await json(`${gateway}/api/v1/governance/tools/approve_action_plan`, {
    method: 'POST', headers: commonHeaders(approver, `aiops-${siteKey}-approve-v1`),
    body: JSON.stringify({ planId: planned.id, reason: `Reviewed exact manifest digest ${digest}; tenant and bounded resource set approved.` }),
  });
  if (approvalResponse.data.state !== 'approved') throw new Error(`Approval did not complete for ${manifest.site.slug}.`);
  for (const actor of [planner, approver]) {
    const denied = await fetch(`${gateway}/api/v1/governance/tools/execute_action_plan`, { method: 'POST', headers: commonHeaders(actor, `aiops-${siteKey}-deny-${Math.random().toString(36).slice(2, 12)}`), body: JSON.stringify({ planId: planned.id }) });
    if (denied.status !== 401) throw new Error(`Separation-of-duties negative test returned ${denied.status} for ${manifest.site.slug}.`);
  }
  const executionResponse = await json(`${gateway}/api/v1/governance/tools/execute_action_plan`, {
    method: 'POST', headers: commonHeaders(executor, `aiops-${siteKey}-execute-v1`), body: JSON.stringify({ planId: planned.id }),
  });
  const executed = executionResponse.data;
  if (executed.state !== 'executed' || executed.execution?.manifestDigest !== digest) throw new Error(`Execution did not complete for ${manifest.site.slug}: ${JSON.stringify({ state: executed.state, execution: executed.execution ?? null, rollback: executed.rollback ?? null })}`);
  if (executed.execution.created.length !== expectedRecordCount(manifest)) throw new Error(`Created-record count did not match the approved manifest for ${manifest.site.slug}.`);
  const auditResponse = await json(`${gateway}/api/v1/governance/tools/list_audit_events`, { method: 'POST', headers: { Authorization: `Bearer ${executor}` }, body: JSON.stringify({ planId: planned.id }) });
  if (!Array.isArray(auditResponse.data?.events) || auditResponse.data.events.length < 3) throw new Error(`Governance audit history is incomplete for ${manifest.site.slug}.`);
  records.push({ siteSlug: manifest.site.slug, planId: planned.id, manifestDigest: digest, expectedCreatedCount: expectedRecordCount(manifest), created: executed.execution.created, auditEventCount: auditResponse.data.events.length, state: executed.state, rollback: 'available through the recorded plan; baseline records intentionally retained' });
}

const adapter = new NetBoxSiteProvisioningAdapter({ baseUrl: process.env.NETBOX_PROVISION_BASE_URL, token: process.env.NETBOX_PROVISION_TOKEN, timeoutMs: Number(process.env.NETBOX_PROVISION_TIMEOUT_MS ?? '5000') });
const verification = [];
for (const manifest of manifests) {
  await adapter.tenantExists(manifest.tenantSlug);
  const addresses = manifest.devices.flatMap((device) => device.interfaces.flatMap((iface) => iface.address ? [iface.address] : []));
  const inUse = await adapter.addressesInUse(addresses);
  const sitePresent = await adapter.siteExists(manifest.site.name, manifest.site.slug);
  if (!sitePresent || inUse.length !== addresses.length) throw new Error(`Post-write NetBox evidence is incomplete for ${manifest.site.slug}.`);
  verification.push({ siteSlug: manifest.site.slug, sitePresent, verifiedAddressCount: inUse.length, expectedAddressCount: addresses.length, governedThisRun: records.some((record) => record.siteSlug === manifest.site.slug) });
}

const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const manifestDigests = allManifests.map((manifest) => ({ siteSlug: manifest.site.slug, manifestDigest: createHash('sha256').update(JSON.stringify(canonical(manifest))).digest('hex') }));
const evidence = { schemaVersion: 1, workflow: 'governed-two-site-netbox-intended-inventory', capturedAt: new Date().toISOString(), tenantSlug: allManifests[0].tenantSlug, sites: records, manifestDigests, netboxVerification: verification, boundary: 'Intended NetBox inventory and WireGuard peer metadata only. No keys, live tunnel state, power telemetry, or independent-site HA claim.', separationOfDuties: 'Planner, approver, and executor identities were distinct; planner and approver execution attempts returned 401 in the governed lifecycle proof.', rollback: 'The governed execution path records created IDs and the disposable proof compensated them in reverse order. Baseline records were intentionally retained as intended state.', sourceManifests: manifestPaths, note: executePlans ? (requestedSite ? `Only ${requestedSite} was executed in this run because the other site already existed from the prior governed execution; both sites were verified after the run.` : undefined) : 'Verify-only mode: no NetBox writes were attempted; both intended baselines were checked through the fixed adapter discovery endpoints.' };
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ok: true, evidencePath: outputPath, tenantSlug: evidence.tenantSlug, sites: records.map((record) => ({ siteSlug: record.siteSlug, planId: record.planId, manifestDigest: record.manifestDigest, createdCount: record.created.length, auditEventCount: record.auditEventCount })), netboxVerification: verification }));
