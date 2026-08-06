import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export interface CustomerSiteManifest {
  version: 1;
  tenantSlug: string;
  site: { name: string; slug: string; facility: string; physicalAddress: string; timeZone: string };
  vlans?: Array<{ name: string; vid: number }>;
  prefixes?: Array<{ prefix: string; vlanName: string | null; description: string }>;
  racks: Array<{ name: string; uHeight: number }>;
  devices: Array<{ name: string; rackName: string; position: number; face: 'front' | 'rear'; deviceTypeSlug: string; roleSlug: string; platformSlug: string | null; interfaces: Array<{ name: string; address: string | null }> }>;
}
export interface ProvisioningDiscovery {
  tenantExists(slug: string): Promise<boolean>;
  siteExists(name: string, slug: string): Promise<boolean>;
  referencesExist(input: { deviceTypeSlugs: string[]; roleSlugs: string[]; platformSlugs: string[] }): Promise<{ missingDeviceTypes: string[]; missingRoles: string[]; missingPlatforms: string[] }>;
  addressesInUse(addresses: string[]): Promise<string[]>;
  networkResourcesInUse?(input: { vlanIds: number[]; prefixes: string[] }): Promise<{ vlanIds: number[]; prefixes: string[] }>;
}
export interface CustomerSiteDryRun {
  manifestDigest: string; tenantSlug: string;
  resourceCounts: { sites: 1; vlans: number; prefixes: number; racks: number; devices: number; interfaces: number; addresses: number };
  orderedSteps: Array<{ order: number; kind: 'site' | 'vlan' | 'prefix' | 'rack' | 'device' | 'interface' | 'ip-address'; key: string }>;
  conflicts: string[]; executable: boolean; boundary: string;
}
export class ProvisioningManifestError extends Error { constructor(message: string) { super(message); this.name = 'ProvisioningManifestError'; } }

export async function planCustomerSiteProvisioning(actorTenant: string, manifest: CustomerSiteManifest, discovery: ProvisioningDiscovery): Promise<CustomerSiteDryRun> {
  validate(actorTenant, manifest);
  const conflicts: string[] = [];
  if (!(await discovery.tenantExists(manifest.tenantSlug))) conflicts.push('Tenant does not exist.');
  if (await discovery.siteExists(manifest.site.name, manifest.site.slug)) conflicts.push('Site name or slug already exists.');
  const refs = await discovery.referencesExist({ deviceTypeSlugs: unique(manifest.devices.map(x => x.deviceTypeSlug)), roleSlugs: unique(manifest.devices.map(x => x.roleSlug)), platformSlugs: unique(manifest.devices.flatMap(x => x.platformSlug ? [x.platformSlug] : [])) });
  for (const value of refs.missingDeviceTypes) conflicts.push(`Device type is unavailable: ${value}`);
  for (const value of refs.missingRoles) conflicts.push(`Device role is unavailable: ${value}`);
  for (const value of refs.missingPlatforms) conflicts.push(`Platform is unavailable: ${value}`);
  const addresses = manifest.devices.flatMap(device => device.interfaces.flatMap(iface => iface.address ? [iface.address] : []));
  for (const address of await discovery.addressesInUse(addresses)) conflicts.push(`IP address is already assigned: ${address}`);
  const vlans=manifest.vlans??[],prefixes=manifest.prefixes??[];
  if ((vlans.length || prefixes.length) && !discovery.networkResourcesInUse) conflicts.push('Network resource discovery is unavailable.');
  else if (discovery.networkResourcesInUse) { const used=await discovery.networkResourcesInUse({vlanIds:vlans.map(x=>x.vid),prefixes:prefixes.map(x=>x.prefix)});for(const vid of used.vlanIds)conflicts.push(`VLAN ID is already in use: ${vid}`);for(const prefix of used.prefixes)conflicts.push(`Prefix is already in use: ${prefix}`); }
  const orderedSteps: CustomerSiteDryRun['orderedSteps'] = []; let order = 1;
  orderedSteps.push({ order: order++, kind: 'site', key: manifest.site.slug });
  for(const vlan of vlans)orderedSteps.push({order:order++,kind:'vlan',key:`${vlan.vid}:${vlan.name}`});
  for(const prefix of prefixes)orderedSteps.push({order:order++,kind:'prefix',key:prefix.prefix});
  for (const rack of manifest.racks) orderedSteps.push({ order: order++, kind: 'rack', key: rack.name });
  for (const device of manifest.devices) { orderedSteps.push({ order: order++, kind: 'device', key: device.name }); for (const iface of device.interfaces) { orderedSteps.push({ order: order++, kind: 'interface', key: `${device.name}:${iface.name}` }); if (iface.address) orderedSteps.push({ order: order++, kind: 'ip-address', key: iface.address }); } }
  return { manifestDigest: createHash('sha256').update(JSON.stringify(canonical(manifest))).digest('hex'), tenantSlug: manifest.tenantSlug, resourceCounts: { sites: 1,vlans:vlans.length,prefixes:prefixes.length, racks: manifest.racks.length, devices: manifest.devices.length, interfaces: manifest.devices.reduce((count, device) => count + device.interfaces.length, 0), addresses: addresses.length }, orderedSteps, conflicts, executable: conflicts.length === 0, boundary: 'Dry run only. No NetBox records were created, changed, or deleted.' };
}
function validate(actorTenant:string,m:CustomerSiteManifest):void{if(!m||m.version!==1||!exact(actorTenant)||m.tenantSlug!==actorTenant||!exact(m.site?.name)||!slug(m.site?.slug)||!exact(m.site?.facility)||!exact(m.site?.physicalAddress)||!exact(m.site?.timeZone)||!Array.isArray(m.racks)||m.racks.length<1||m.racks.length>20||!Array.isArray(m.devices)||m.devices.length<1||m.devices.length>50)fail();const vlans=m.vlans??[],prefixes=m.prefixes??[];if(!Array.isArray(vlans)||vlans.length>64||!Array.isArray(prefixes)||prefixes.length>64)fail();const vlanNames=vlans.map(x=>x.name),vids=vlans.map(x=>x.vid);if(new Set(vlanNames).size!==vlanNames.length||new Set(vids).size!==vids.length||vlans.some(x=>!exact(x.name)||!Number.isInteger(x.vid)||x.vid<1||x.vid>4094))fail();const prefixValues=prefixes.map(x=>x.prefix);if(new Set(prefixValues).size!==prefixValues.length||prefixes.some(x=>!network(x.prefix)||(x.vlanName!==null&&!vlanNames.includes(x.vlanName))||!exact(x.description)))fail();const rackNames=m.racks.map(x=>x.name);if(new Set(rackNames).size!==rackNames.length||m.racks.some(x=>!exact(x.name)||!Number.isInteger(x.uHeight)||x.uHeight<1||x.uHeight>60))fail();const deviceNames=m.devices.map(x=>x.name);if(new Set(deviceNames).size!==deviceNames.length)fail();const addresses:string[]=[];for(const device of m.devices){if(!exact(device.name)||!rackNames.includes(device.rackName)||!Number.isInteger(device.position)||device.position<1||device.position>m.racks.find(x=>x.name===device.rackName)!.uHeight||!['front','rear'].includes(device.face)||!slug(device.deviceTypeSlug)||!slug(device.roleSlug)||(device.platformSlug!==null&&!slug(device.platformSlug))||!Array.isArray(device.interfaces)||device.interfaces.length>16)fail();const names=device.interfaces.map(x=>x.name);if(new Set(names).size!==names.length)fail();for(const iface of device.interfaces){if(!exact(iface.name)||(iface.address!==null&&!network(iface.address)))fail();if(iface.address)addresses.push(iface.address);}}if(new Set(addresses).size!==addresses.length)fail();}
function network(value:unknown):value is string{if(!exact(value)||!/^.+\/\d{1,3}$/.test(value))return false;const[host,length]=value.split('/');const family=isIP(host),bits=Number(length);return family===4?bits>=0&&bits<=32:family===6&&bits>=0&&bits<=128;}
function fail():never{throw new ProvisioningManifestError('Customer-site manifest is invalid or outside the actor tenant scope.');}
function exact(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.trim()===value&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);}
function slug(value:unknown):value is string{return typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(value);}
function unique(values:string[]):string[]{return[...new Set(values)].sort();}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
