import { NetBoxSiteProvisioningAdapter } from '../../../dist/src/netbox-site-provisioning-adapter.js';
import { planCustomerSiteProvisioning } from '../../../dist/src/site-provisioning-manifest.js';
import { executeApprovedCustomerSiteProvisioning } from '../../../dist/src/site-provisioning-executor.js';

const baseUrl = process.env.NETBOX_PROVISION_BASE_URL;
const token = process.env.NETBOX_PROVISION_TOKEN;
const timeoutMs = Number(process.env.NETBOX_PROVISION_TIMEOUT_MS ?? '5000');
if (!baseUrl || !token || !Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('Provisioning verification configuration is invalid.');

const manifest = {
  version: 1,
  tenantSlug: 'northstar-financial',
  site: { name: 'Northstar Tucson Verification', slug: 'northstar-tucson-verification', facility: 'TUS-VERIFY', physicalAddress: 'Sanitized disposable verification site, Tucson, AZ', timeZone: 'America/Phoenix' },
  racks: [{ name: 'TUS-V01', uHeight: 42 }],
  devices: [{ name: 'ns-tus-verify-edge-01', rackName: 'TUS-V01', position: 42, face: 'front', deviceTypeSlug: 'edge-router-1000', roleSlug: 'edge-router', platformSlug: null, interfaces: [{ name: 'ge-0/0/0', address: '198.51.100.254/32' }] }],
};

const adapter = new NetBoxSiteProvisioningAdapter({ baseUrl, token, timeoutMs });
let created = [];
try {
  const dryRun = await planCustomerSiteProvisioning(manifest.tenantSlug, manifest, adapter);
  if (!dryRun.executable || dryRun.orderedSteps.length !== 5) throw new Error(`Provisioning dry run was not executable: ${dryRun.conflicts.join('; ')}`);
  const execution = await executeApprovedCustomerSiteProvisioning({ actorTenant: manifest.tenantSlug, approvedManifestDigest: dryRun.manifestDigest, manifest }, adapter, adapter);
  created = execution.created;
  if (execution.state !== 'executed' || created.length !== 5) throw new Error('Provisioning execution did not create the expected bounded record set.');
  if (!(await adapter.siteExists(manifest.site.name, manifest.site.slug))) throw new Error('Provisioned site could not be verified through recorded NetBox evidence.');
  if (!(await adapter.addressesInUse(['198.51.100.254/32'])).length) throw new Error('Provisioned IP address could not be verified through recorded NetBox evidence.');
  console.log(JSON.stringify({ ok: true, manifestDigest: dryRun.manifestDigest, resourceCounts: dryRun.resourceCounts, createdKinds: created.map(record => record.kind), boundary: execution.boundary }));
} finally {
  for (const record of [...created].reverse()) await adapter.deleteCreated(record);
  if (created.length && await adapter.siteExists(manifest.site.name, manifest.site.slug)) throw new Error('Provisioning verification cleanup is incomplete.');
}
