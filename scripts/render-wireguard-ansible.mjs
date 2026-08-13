import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderWireGuardAnsibleInventory } from '../dist/src/wireguard-ansible.js';

const las = JSON.parse(await readFile('config/aiops/las-vegas.site.json', 'utf8'));
const chi = JSON.parse(await readFile('config/aiops/chicago.site.json', 'utf8'));
const artifact = renderWireGuardAnsibleInventory(las, chi);
const output = resolve(process.argv[2] ?? 'ansible/wireguard/inventory.generated.json');
await writeFile(output, artifact.inventoryJson, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ result: 'rendered', pairDigest: artifact.pairDigest, output, boundary: artifact.boundary })}\n`);
