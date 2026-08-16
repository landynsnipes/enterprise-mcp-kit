import { createHash } from 'node:crypto';
import { validateTwoSiteWireGuardContract, type CustomerSiteManifest } from './site-provisioning-manifest.js';

export interface WireGuardPreflightEvidence {
  result:'ready-for-approval'; pairDigest:string; decisionTraceId:string; expiresAt:string;
  checks:{siteSlug:string;privateKeyFormat:'valid';peerPublicKeyFormat:'valid';peerFingerprint:'matched'}[];
  boundary:string;
}

export function createWireGuardPreflightEvidence(first:CustomerSiteManifest,second:CustomerSiteManifest,environment:NodeJS.ProcessEnv,decisionTraceId:string,expiresAt:string):WireGuardPreflightEvidence{
  if(!/^dtr_[A-Za-z0-9_-]{8,64}$/.test(decisionTraceId))throw new Error('A bounded decision trace ID is required.');
  const expiry=new Date(expiresAt);if(Number.isNaN(expiry.valueOf())||expiry.valueOf()<=Date.now())throw new Error('Preflight expiry must be a future ISO timestamp.');
  const contract=validateTwoSiteWireGuardContract(first,second),manifests=[first,second].sort((a,b)=>a.site.slug.localeCompare(b.site.slug));
  const checks=[];
  for(const manifest of manifests){const tunnel=manifest.devices.flatMap(device=>device.interfaces).find(item=>item.wireguard);if(!tunnel?.wireguard)throw new Error(`Site ${manifest.site.slug} has no WireGuard endpoint.`);const privateName=secretName(manifest.site.slug,'PRIVATE_KEY'),peerManifest=manifests.find(item=>item.site.slug===tunnel.wireguard!.peerSiteSlug)!;const publicName=secretName(peerManifest.site.slug,'PUBLIC_KEY');validateKey(environment[privateName],privateName);const peerPublic=validateKey(environment[publicName],publicName);const fingerprint=`sha256:${createHash('sha256').update(peerPublic).digest('hex')}`;if(fingerprint!==tunnel.wireguard.peerPublicKeyFingerprint)throw new Error(`Peer public key fingerprint mismatch for site ${manifest.site.slug}.`);checks.push({siteSlug:manifest.site.slug,privateKeyFormat:'valid' as const,peerPublicKeyFormat:'valid' as const,peerFingerprint:'matched' as const});}
  return{result:'ready-for-approval',pairDigest:contract.pairDigest,decisionTraceId,expiresAt:expiry.toISOString(),checks,boundary:'Preflight validates secret shape and approved fingerprints only. It neither approves nor executes Ansible.'};
}
function validateKey(value:string|undefined,name:string):Buffer{if(!value)throw new Error(`Missing required secret environment variable ${name}.`);const decoded=Buffer.from(value,'base64');if(decoded.length!==32||decoded.toString('base64')!==value)throw new Error(`${name} must be canonical base64 for exactly 32 bytes.`);return decoded;}
function secretName(siteSlug:string,suffix:string){return`WIREGUARD_${siteSlug.replace(/-/g,'_').toUpperCase()}_${suffix}`;}
