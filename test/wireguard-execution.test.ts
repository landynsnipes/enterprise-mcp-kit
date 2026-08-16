import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createWireGuardPreflightEvidence } from '../src/wireguard-execution.js';
import type { CustomerSiteManifest } from '../src/site-provisioning-manifest.js';

const load=async(name:string)=>JSON.parse(await readFile(`config/aiops/${name}.site.json`,'utf8'))as CustomerSiteManifest;
const key=(byte:number)=>Buffer.alloc(32,byte).toString('base64');
const fingerprint=(value:string)=>`sha256:${createHash('sha256').update(Buffer.from(value,'base64')).digest('hex')}`;

test('creates secret-free, digest-bound preflight evidence',async()=>{const las=await load('las-vegas'),chi=await load('chicago'),lasPublic=key(1),chiPublic=key(2);las.devices[0].interfaces.find(item=>item.wireguard)!.wireguard!.peerPublicKeyFingerprint=fingerprint(chiPublic);chi.devices[0].interfaces.find(item=>item.wireguard)!.wireguard!.peerPublicKeyFingerprint=fingerprint(lasPublic);const environment={WIREGUARD_LAS_VEGAS_LAB_PRIVATE_KEY:key(3),WIREGUARD_LAS_VEGAS_LAB_PUBLIC_KEY:lasPublic,WIREGUARD_CHICAGO_LAB_PRIVATE_KEY:key(4),WIREGUARD_CHICAGO_LAB_PUBLIC_KEY:chiPublic};const evidence=createWireGuardPreflightEvidence(las,chi,environment,'dtr_wireguard_test_01',new Date(Date.now()+60_000).toISOString());assert.equal(evidence.result,'ready-for-approval');assert.equal(evidence.checks.length,2);assert.doesNotMatch(JSON.stringify(evidence),new RegExp(lasPublic));assert.match(evidence.boundary,/neither approves nor executes/);});
test('rejects missing, malformed, or mismatched secrets',async()=>{const las=await load('las-vegas'),chi=await load('chicago'),future=new Date(Date.now()+60_000).toISOString();assert.throws(()=>createWireGuardPreflightEvidence(las,chi,{},'dtr_wireguard_test_02',future),/Missing required secret/);const environment={WIREGUARD_LAS_VEGAS_LAB_PRIVATE_KEY:key(3),WIREGUARD_LAS_VEGAS_LAB_PUBLIC_KEY:key(1),WIREGUARD_CHICAGO_LAB_PRIVATE_KEY:key(4),WIREGUARD_CHICAGO_LAB_PUBLIC_KEY:key(2)};assert.throws(()=>createWireGuardPreflightEvidence(las,chi,environment,'dtr_wireguard_test_03',future),/fingerprint mismatch/);assert.throws(()=>createWireGuardPreflightEvidence(las,chi,{...environment,WIREGUARD_CHICAGO_LAB_PRIVATE_KEY:'bad'},'dtr_wireguard_test_04',future),/canonical base64/);});
