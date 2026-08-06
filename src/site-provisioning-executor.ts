import { planCustomerSiteProvisioning, ProvisioningManifestError, type CustomerSiteManifest, type ProvisioningDiscovery } from './site-provisioning-manifest.js';
export type ProvisionedKind='site'|'vlan'|'prefix'|'rack'|'device'|'interface'|'ip-address';
export interface ProvisionedRecord{kind:ProvisionedKind;id:number;key:string;}
export interface SiteProvisioningAdapter{
  createSite(input:{tenantSlug:string;name:string;slug:string;facility:string;physicalAddress:string;timeZone:string}):Promise<number>;
  createVlan?(input:{siteId:number;tenantSlug:string;name:string;vid:number}):Promise<number>;
  createPrefix?(input:{siteId:number;tenantSlug:string;prefix:string;vlanId:number|null;description:string}):Promise<number>;
  createRack(input:{siteId:number;tenantSlug:string;name:string;uHeight:number}):Promise<number>;
  createDevice(input:{siteId:number;tenantSlug:string;rackId:number;name:string;position:number;face:'front'|'rear';deviceTypeSlug:string;roleSlug:string;platformSlug:string|null}):Promise<number>;
  createInterface(input:{deviceId:number;name:string}):Promise<number>;
  createIpAddress(input:{interfaceId:number;address:string;tenantSlug:string}):Promise<number>;
  deleteCreated(record:ProvisionedRecord):Promise<void>;
}
export interface SiteProvisioningExecution{manifestDigest:string;state:'executed'|'compensated'|'compensation_failed';created:ProvisionedRecord[];compensated:ProvisionedRecord[];errors:string[];boundary:string;}
export class SiteProvisioningExecutionError extends Error{constructor(message:string,readonly result?:SiteProvisioningExecution){super(message);this.name='SiteProvisioningExecutionError';}}
export async function executeApprovedCustomerSiteProvisioning(input:{actorTenant:string;approvedManifestDigest:string;manifest:CustomerSiteManifest},discovery:ProvisioningDiscovery,adapter:SiteProvisioningAdapter):Promise<SiteProvisioningExecution>{
  if(!/^[a-f0-9]{64}$/.test(input?.approvedManifestDigest))throw new ProvisioningManifestError('Approved manifest digest is invalid.');
  const dry=await planCustomerSiteProvisioning(input.actorTenant,input.manifest,discovery);if(dry.manifestDigest!==input.approvedManifestDigest)throw new SiteProvisioningExecutionError('Manifest no longer matches the approved digest.');if(!dry.executable)throw new SiteProvisioningExecutionError('Manifest conflicts must be resolved before execution.');
  const created:ProvisionedRecord[]=[],compensated:ProvisionedRecord[]=[],errors:string[]=[];
  try{
    const siteId=await adapter.createSite({tenantSlug:input.manifest.tenantSlug,...input.manifest.site});created.push({kind:'site',id:siteId,key:input.manifest.site.slug});
    const vlanIds=new Map<string,number>();for(const vlan of input.manifest.vlans??[]){if(!adapter.createVlan)throw new SiteProvisioningExecutionError('Provisioning adapter does not support VLAN creation.');const id=await adapter.createVlan({siteId,tenantSlug:input.manifest.tenantSlug,...vlan});vlanIds.set(vlan.name,id);created.push({kind:'vlan',id,key:`${vlan.vid}:${vlan.name}`});}
    for(const prefix of input.manifest.prefixes??[]){if(!adapter.createPrefix)throw new SiteProvisioningExecutionError('Provisioning adapter does not support prefix creation.');const id=await adapter.createPrefix({siteId,tenantSlug:input.manifest.tenantSlug,prefix:prefix.prefix,vlanId:prefix.vlanName?vlanIds.get(prefix.vlanName)!:null,description:prefix.description});created.push({kind:'prefix',id,key:prefix.prefix});}
    const rackIds=new Map<string,number>();for(const rack of input.manifest.racks){const id=await adapter.createRack({siteId,tenantSlug:input.manifest.tenantSlug,...rack});rackIds.set(rack.name,id);created.push({kind:'rack',id,key:rack.name});}
    for(const device of input.manifest.devices){const deviceId=await adapter.createDevice({siteId,tenantSlug:input.manifest.tenantSlug,rackId:rackIds.get(device.rackName)!,name:device.name,position:device.position,face:device.face,deviceTypeSlug:device.deviceTypeSlug,roleSlug:device.roleSlug,platformSlug:device.platformSlug});created.push({kind:'device',id:deviceId,key:device.name});for(const iface of device.interfaces){const interfaceId=await adapter.createInterface({deviceId,name:iface.name});created.push({kind:'interface',id:interfaceId,key:`${device.name}:${iface.name}`});if(iface.address){const id=await adapter.createIpAddress({interfaceId,address:iface.address,tenantSlug:input.manifest.tenantSlug});created.push({kind:'ip-address',id,key:iface.address});}}}
    return{manifestDigest:dry.manifestDigest,state:'executed',created:[...created],compensated,errors,boundary:'Only records listed in created were produced by this execution.'};
  }catch(error){errors.push(safe(error));for(const record of [...created].reverse()){try{await adapter.deleteCreated(record);compensated.push(record);}catch(compensationError){errors.push(`Compensation failed for ${record.kind}:${record.id}: ${safe(compensationError)}`);}}const result:SiteProvisioningExecution={manifestDigest:dry.manifestDigest,state:compensated.length===created.length?'compensated':'compensation_failed',created:[...created],compensated,errors,boundary:'Compensation targeted only IDs created by this execution; pre-existing records were untouched.'};throw new SiteProvisioningExecutionError(result.state==='compensated'?'Provisioning failed and all created records were compensated.':'Provisioning failed and compensation is incomplete.',result);}
}
function safe(error:unknown):string{return error instanceof Error&&error.message.length<=200?error.message:'Provisioning adapter failed.';}
