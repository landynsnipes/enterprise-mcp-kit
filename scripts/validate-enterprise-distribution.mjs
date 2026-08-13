import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const distribution = await readJson('config/enterprise-distribution.json');
const fields = await readJson('config/enterprise-custom-fields.json');
const packageJson = await readJson('package.json');
const packageLock = await readJson('package-lock.json');
const compose = await readFile('demo/netbox-lab/compose.yaml', 'utf8');
const cloudEventCompose = await readFile('demo/cloud-events/compose.yaml', 'utf8');
const natsConfig = await readFile('demo/cloud-events/config/nats.conf', 'utf8');
const composeInventory = `${compose}\n${cloudEventCompose}`;
const upgradeGate = await readFile('demo/netbox-lab/scripts/verify-upgrade-rollback.sh', 'utf8');
const upgradeOrigin = await readFile('demo/netbox-lab/config/upgrade-origin.compose.yaml', 'utf8');
const upgradeTarget = await readFile('demo/netbox-lab/config/upgrade-target.compose.yaml', 'utf8');
const operations = await readFile('docs/production-reference-operations.md', 'utf8');
const cloudEventDashboard = await readJson('demo/observability/grafana/dashboards/cloud-event-operations.json');

assert.equal(distribution.schemaVersion, 1);
assert.ok(['evaluation-reference', 'production-reference'].includes(distribution.distributionStatus));
assert.equal(distribution.policy.commercialUseRequired, true);
assert.equal(distribution.policy.sourceAvailableRequired, true);
assert.equal(distribution.policy.paidRuntimeDependencyAllowed, false);
assert.equal(distribution.policy.mandatoryVendorCloudAllowed, false);

const approved = new Set(distribution.policy.approvedLicenses);
const denied = new Set(distribution.policy.deniedLicenses);
assert.ok(approved.size > 0);
for (const license of denied) assert.ok(!approved.has(license), `${license} cannot be both approved and denied.`);

const componentIds = new Set();
for (const component of distribution.components) {
  assert.match(component.id, /^[a-z0-9-]+$/);
  assert.ok(!componentIds.has(component.id), `Duplicate component ID: ${component.id}`);
  componentIds.add(component.id);
  assert.ok(component.name);
  assert.ok(component.version);
  assert.ok(component.source.startsWith('https://'));
  assert.ok(approved.has(component.license), `Unapproved component license: ${component.id} ${component.license}`);
  assert.ok(!denied.has(component.license), `Denied component license: ${component.id} ${component.license}`);
}

for (const candidate of distribution.pluginCandidates) {
  assert.equal(candidate.status, 'not-installed-not-supported', `${candidate.id} must remain unsupported until admitted.`);
  assert.ok(approved.has(candidate.license), `Unapproved candidate license: ${candidate.id} ${candidate.license}`);
  assert.ok(candidate.admissionRequirements.length >= 6, `${candidate.id} lacks enterprise admission gates.`);
}

const rootComponent = distribution.components.find((component) => component.id === 'enterprise-mcp-kit');
assert.ok(rootComponent);
assert.equal(rootComponent.version, packageJson.version);
assert.equal(rootComponent.license, packageJson.license);

for (const component of distribution.components.filter((item) => item.package)) {
  const lockEntry = packageLock.packages?.[`node_modules/${component.package}`];
  assert.ok(lockEntry, `Missing locked package: ${component.package}`);
  assert.equal(lockEntry.version, component.version, `Manifest version drift: ${component.package}`);
  assert.equal(lockEntry.license, component.license, `Manifest license drift: ${component.package}`);
  assert.equal(packageJson.dependencies?.[component.package], component.version, `Runtime dependency must be exactly pinned: ${component.package}`);
}

const spdxTokens = (expression) => expression
  .replace(/[()]/g, ' ')
  .split(/\s+(?:AND|OR|WITH)\s+|\s+/)
  .filter(Boolean);
const npmLicenses = new Set();
for (const [path, entry] of Object.entries(packageLock.packages ?? {})) {
  if (!path || !entry.license) continue;
  npmLicenses.add(entry.license);
  for (const license of spdxTokens(entry.license)) {
    assert.ok(approved.has(license), `Unapproved npm license ${license} at ${path}`);
    assert.ok(!denied.has(license), `Denied npm license ${license} at ${path}`);
  }
}

for (const component of distribution.components.filter((item) => item.artifact)) {
  assert.ok(composeInventory.includes(`image: ${component.artifact}`), `Compose image drift: ${component.id}`);
}
assert.doesNotMatch(compose, /image:\s*(?:docker\.io\/)?redis(?:\/|:)/i, 'Redis images are not allowed; use Valkey.');
assert.doesNotMatch(cloudEventCompose, /env_file:/, 'Cloud-event services must receive only explicitly scoped environment variables.');
assert.match(natsConfig, /password:\s*"__NATS_API_PASSWORD_BCRYPT__"/);
assert.match(natsConfig, /password:\s*"__NATS_WORKER_PASSWORD_BCRYPT__"/);
assert.doesNotMatch(cloudEventCompose, /NATS_(?:API|WORKER)_PASSWORD_BCRYPT/, 'NATS bcrypt hashes must be mounted through a generated config, not injected into the container environment.');
const [apiPermissions, workerPermissions] = natsConfig.match(/\{ user: "__NATS_(?:API|WORKER)_USER__"[^\n]+/g) ?? [];
assert.match(apiPermissions ?? '', /aiops\.cloud\.events\.v1/);
assert.doesNotMatch(apiPermissions ?? '', /\$JS\.ACK/);
assert.match(workerPermissions ?? '', /\$JS\.ACK/);
assert.doesNotMatch(workerPermissions ?? '', /aiops\.cloud\.events\.v1/);
assert.equal(packageJson.scripts['demo:upgrade:verify'], 'bash demo/netbox-lab/scripts/verify-upgrade-rollback.sh');
assert.match(upgradeGate, /enterprise-mcp-kit-upgrade-\$\$/);
assert.match(upgradeGate, /verify_five_tools "\$token"/);
assert.match(upgradeGate, /pg_restore/);
assert.match(upgradeOrigin, /sha256:094e0997eb8916d1e47dba8ac53e32427ee9639cd838512747b771421dff3c9b/);
assert.match(upgradeTarget, /sha256:691ec1a4f569f3dfb9fefd9f086cca1b39689ad59c3eae753712a741447e5e60/);
assert.match(operations, /npm run demo:upgrade:verify/);

assert.equal(cloudEventDashboard.uid, 'aiops-cloud-event-operations');
assert.equal(cloudEventDashboard.editable, false);
assert.equal(cloudEventDashboard.refresh, '10s');
assert.ok(cloudEventDashboard.tags.includes('governance'));
assert.ok(cloudEventDashboard.panels.length >= 9);
const dashboardQueries = cloudEventDashboard.panels.flatMap((panel) => panel.targets ?? []).map((target) => target.expr ?? '').join('\n');
assert.match(dashboardQueries, /up\{job="cloud-event-api"\}/);
assert.match(dashboardQueries, /up\{job="cloud-event-worker"\}/);
assert.match(dashboardQueries, /aiops_cloud_event_queue_depth/);
assert.match(dashboardQueries, /aiops_cloud_event_request_duration_milliseconds_sum/);
assert.match(dashboardQueries, /outcome=~"accepted\|replayed\|rejected"/);
assert.match(dashboardQueries, /outcome=~"processed\|retrying\|dead_lettered"/);
assert.ok(cloudEventDashboard.panels.every((panel) => panel.type === 'text' || panel.datasource?.uid === 'aiops-prometheus'));

assert.equal(fields.schemaVersion, 1);
assert.ok(fields.principles.length >= 4);
const allowedTypes = new Set(['text', 'longtext', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'url', 'json', 'selection', 'multiselect', 'object', 'multiobject']);
const fieldNames = new Set();
for (const field of fields.fields) {
  assert.match(field.name, /^[a-z0-9_]+$/);
  assert.ok(!fieldNames.has(field.name), `Duplicate custom field: ${field.name}`);
  fieldNames.add(field.name);
  assert.ok(allowedTypes.has(field.type), `Unknown custom field type: ${field.name} ${field.type}`);
  assert.ok(field.objectTypes.length > 0, `Custom field has no object types: ${field.name}`);
  assert.ok(['implemented-showcase', 'implemented-migration-planned', 'planned'].includes(field.status), `Unknown field status: ${field.name}`);
  if (field.type === 'selection' || field.targetType === 'selection') {
    assert.ok(new Set(field.choices).size >= 2, `Selection field needs at least two choices: ${field.name}`);
  }
}

for (const requiredField of [
  'observed_software_version',
  'minimum_approved_version',
  'version_compliance',
  'version_evidence_source',
  'version_observed_at',
  'reconciliation_status',
  'authoritative_source',
]) {
  assert.ok(fieldNames.has(requiredField), `Required enterprise field missing: ${requiredField}`);
}

for (const document of ['ENTERPRISE-DISTRIBUTION.md', 'THIRD_PARTY_LICENSES.md', 'README.md']) {
  assert.ok((await readFile(document, 'utf8')).length > 100, `Missing or empty document: ${document}`);
}

const unpinnedArtifacts = distribution.components
  .filter((component) => component.artifact && !component.artifact.includes('@sha256:'))
  .map((component) => component.id);
assert.deepEqual(unpinnedArtifacts, [], 'Included container artifacts must be pinned by digest.');

console.log(JSON.stringify({
  result: 'passed',
  distributionStatus: distribution.distributionStatus,
  includedComponents: distribution.components.length,
  pluginCandidates: distribution.pluginCandidates.length,
  customFields: fields.fields.length,
  npmLicenses: [...npmLicenses].sort(),
  imageDigestPinning: 'passed',
}, null, 2));
