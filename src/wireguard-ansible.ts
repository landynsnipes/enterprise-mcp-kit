import { validateTwoSiteWireGuardContract, type CustomerSiteManifest } from './site-provisioning-manifest.js';

export interface WireGuardAnsibleArtifact { pairDigest:string; inventoryJson:string; boundary:string; }

export function renderWireGuardAnsibleInventory(first:CustomerSiteManifest,second:CustomerSiteManifest):WireGuardAnsibleArtifact{
  const contract=validateTwoSiteWireGuardContract(first,second),manifests=[first,second].sort((a,b)=>a.site.slug.localeCompare(b.site.slug));
  const hosts:Record<string,unknown>={};
  for(const manifest of manifests)for(const device of manifest.devices){const management=device.interfaces.find(x=>x.name==='mgmt0'&&x.address),tunnel=device.interfaces.find(x=>x.wireguard);if(!tunnel)continue;if(!management)throw new Error('WireGuard router requires an addressed mgmt0 interface.');const peerManifest=manifests.find(x=>x.site.slug===tunnel.wireguard!.peerSiteSlug)!;const peerDevice=peerManifest.devices.find(x=>x.name===tunnel.wireguard!.peerDeviceName)!;const peerManagement=peerDevice.interfaces.find(x=>x.name==='mgmt0'&&x.address);if(!peerManagement)throw new Error('WireGuard peer requires an addressed mgmt0 interface.');hosts[device.name]={ansible_host:host(management.address!),wireguard:{interface:tunnel.name,address:tunnel.address,listen_port:tunnel.wireguard!.listenPort,allowed_prefixes:[...tunnel.wireguard!.allowedPrefixes].sort(),peer_device:tunnel.wireguard!.peerDeviceName,peer_endpoint:`${host(peerManagement.address!)}:${tunnel.wireguard!.listenPort}`,peer_public_key_fingerprint:tunnel.wireguard!.peerPublicKeyFingerprint,private_key_env:secretName(manifest.site.slug,'PRIVATE_KEY'),peer_public_key_env:secretName(peerManifest.site.slug,'PUBLIC_KEY')}};}
  for(const hostValue of Object.values(hosts)){const hostRecord=hostValue as {wireguard:Record<string,unknown>};hostRecord.wireguard.package_name='wireguard';hostRecord.wireguard.package_version_env='WIREGUARD_UBUNTU_PACKAGE_VERSION';}
  return{pairDigest:contract.pairDigest,inventoryJson:`${JSON.stringify({all:{children:{wireguard_routers:{hosts}}}},null,2)}\n`,boundary:'Generated secret references and intended configuration only. Ansible execution still requires exact approval, an OS-verified package version, and out-of-band key injection.'};
}
function host(address:string){return address.split('/')[0];}
function secretName(siteSlug:string,suffix:string){return`WIREGUARD_${siteSlug.replace(/-/g,'_').toUpperCase()}_${suffix}`;}
