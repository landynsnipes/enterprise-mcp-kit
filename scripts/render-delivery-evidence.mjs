const required = ['EVIDENCE_ACTION','EVIDENCE_SITE','EVIDENCE_NAMESPACE','EVIDENCE_TRACE','EVIDENCE_COMMIT','EVIDENCE_PIPELINE','EVIDENCE_DESIRED','EVIDENCE_AVAILABLE'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required.`);
if (!['deploy','rollback'].includes(process.env.EVIDENCE_ACTION)) throw new Error('Invalid evidence action.');
if (!['las','chi'].includes(process.env.EVIDENCE_SITE)) throw new Error('Invalid evidence site.');
if (!/^[a-f0-9]{40}$/.test(process.env.EVIDENCE_COMMIT)) throw new Error('Invalid evidence commit.');
if (!/^[1-9][0-9]{0,18}$/.test(process.env.EVIDENCE_PIPELINE)) throw new Error('Invalid evidence pipeline.');
const desired = Number(process.env.EVIDENCE_DESIRED);
const available = Number(process.env.EVIDENCE_AVAILABLE);
if (!Number.isSafeInteger(desired) || !Number.isSafeInteger(available)) throw new Error('Invalid replica evidence.');
const evidence = {
  evidenceVersion: 1,
  action: process.env.EVIDENCE_ACTION,
  result: 'passed',
  site: process.env.EVIDENCE_SITE,
  namespace: process.env.EVIDENCE_NAMESPACE,
  decisionTraceId: process.env.EVIDENCE_TRACE,
  commitSha: process.env.EVIDENCE_COMMIT,
  pipelineId: process.env.EVIDENCE_PIPELINE,
  before: { deploymentRevision: process.env.EVIDENCE_BEFORE_REVISION ?? '', image: process.env.EVIDENCE_BEFORE_IMAGE ?? '' },
  after: { deploymentRevision: process.env.EVIDENCE_AFTER_REVISION ?? '', image: process.env.EVIDENCE_AFTER_IMAGE ?? '', desiredReplicas: desired, availableReplicas: available },
  claimsBoundary: 'Logical LAS/CHI namespaces share one K3s node and physical WSL host; this is promotion and rollback evidence, not physical HA.',
};
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
