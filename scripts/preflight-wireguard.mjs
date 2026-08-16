import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createWireGuardPreflightEvidence } from '../dist/src/wireguard-execution.js';

const las=JSON.parse(await readFile('config/aiops/las-vegas.site.json','utf8'));
const chi=JSON.parse(await readFile('config/aiops/chicago.site.json','utf8'));
const trace=process.env.DECISION_TRACE_ID??`dtr_${randomUUID().replaceAll('-','')}`;
const expiresAt=process.env.APPROVAL_EXPIRES_AT??new Date(Date.now()+15*60_000).toISOString();
const evidence=createWireGuardPreflightEvidence(las,chi,process.env,trace,expiresAt);
process.stdout.write(`${JSON.stringify(evidence,null,2)}\n`);
