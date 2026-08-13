import assert from 'node:assert/strict';
import test from 'node:test';
import { executeApprovedCustomerSiteProvisioning, type SiteProvisioningAdapter } from '../src/site-provisioning-executor.js';
import { planCustomerSiteProvisioning, type CustomerSiteManifest, type WireGuardInterfaceIntent } from '../src/site-provisioning-manifest.js';

const wireguard: WireGuardInterfaceIntent = {
  peerSiteSlug: 'northstar-chicago',
  peerDeviceName: 'ns-chi-edge-01',
  peerInterfaceName: 'wg0',
  allowedPrefixes: ['10.20.0.0/16'],
  listenPort: 51820,
  peerPublicKeyFingerprint: `sha256:${'d'.repeat(64)}`,
};

const manifest: CustomerSiteManifest = {
  version: 1,
  tenantSlug: 'northstar-financial',
  site: { name: 'Northstar Las Vegas', slug: 'northstar-las-vegas', facility: 'LAS-01', physicalAddress: '100 Example Way, Las Vegas, NV', timeZone: 'America/Los_Angeles' },
  racks: [{ name: 'LAS-A01', uHeight: 42 }],
  devices: [{ name: 'ns-las-edge-01', rackName: 'LAS-A01', position: 42, face: 'front', deviceTypeSlug: 'edge-router-1000', roleSlug: 'edge-router', platformSlug: 'example-network-os', interfaces: [{ name: 'wg0', address: '10.255.0.1/30', wireguard }] }],
};

const discovery = {
  tenantExists: async () => true,
  siteExists: async () => false,
  referencesExist: async () => ({ missingDeviceTypes: [], missingRoles: [], missingPlatforms: [] }),
  addressesInUse: async () => [],
};

test('propagates digest-bound WireGuard intent through the approved executor', async () => {
  let id = 0;
  const interfaceInputs: Array<{ deviceId: number; name: string; wireguard?: WireGuardInterfaceIntent | null }> = [];
  const adapter: SiteProvisioningAdapter = {
    createSite: async () => ++id,
    createRack: async () => ++id,
    createDevice: async () => ++id,
    createInterface: async (input) => { interfaceInputs.push(input); return ++id; },
    createIpAddress: async () => ++id,
    deleteCreated: async () => undefined,
  };
  const plan = await planCustomerSiteProvisioning('northstar-financial', manifest, discovery);
  const result = await executeApprovedCustomerSiteProvisioning({ actorTenant: 'northstar-financial', approvedManifestDigest: plan.manifestDigest, manifest }, discovery, adapter);
  assert.equal(result.state, 'executed');
  assert.equal(plan.resourceCounts.wireguardInterfaces, 1);
  assert.deepEqual(interfaceInputs, [{ deviceId: 3, name: 'wg0', wireguard }]);
  assert.deepEqual(result.created.map((record) => record.kind), ['site', 'rack', 'device', 'interface', 'ip-address']);
});
