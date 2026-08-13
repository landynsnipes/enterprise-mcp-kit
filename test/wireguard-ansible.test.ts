import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderWireGuardAnsibleInventory } from '../src/wireguard-ansible.js';
import type { CustomerSiteManifest } from '../src/site-provisioning-manifest.js';

const load=async(name:string)=>JSON.parse(await readFile(`config/aiops/${name}.site.json`,'utf8'))as CustomerSiteManifest;
test('renders deterministic secret-free Ansible inventory from the reciprocal contract',async()=>{const las=await load('las-vegas'),chi=await load('chicago');const first=renderWireGuardAnsibleInventory(las,chi),second=renderWireGuardAnsibleInventory(chi,las);assert.deepEqual(first,second);const inventory=JSON.parse(first.inventoryJson),hosts=inventory.all.children.wireguard_routers.hosts;assert.equal(hosts['aiops-las-edge-01'].ansible_host,'10.10.0.10');assert.equal(hosts['aiops-las-edge-01'].wireguard.peer_endpoint,'10.20.0.10:51820');assert.equal(hosts['aiops-las-edge-01'].wireguard.private_key_env,'WIREGUARD_LAS_VEGAS_LAB_PRIVATE_KEY');assert.equal(hosts['aiops-las-edge-01'].wireguard.peer_public_key_env,'WIREGUARD_CHICAGO_LAB_PUBLIC_KEY');assert.equal(hosts['aiops-las-edge-01'].wireguard.package_name,'wireguard');assert.equal(hosts['aiops-las-edge-01'].wireguard.package_version_env,'WIREGUARD_UBUNTU_PACKAGE_VERSION');assert.doesNotMatch(first.inventoryJson,/BEGIN|private_key\s*"\s*:/i);assert.match(first.boundary,/OS-verified package version/);});
