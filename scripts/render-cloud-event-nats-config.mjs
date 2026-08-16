import { chmod, readFile, rename, writeFile } from 'node:fs/promises';

const envPath = 'demo/cloud-events/.env';
const outputPath = 'demo/cloud-events/.nats.generated.conf';
const templatePath = 'demo/cloud-events/config/nats.conf';
const values = Object.fromEntries((await readFile(envPath, 'utf8')).trim().split('\n').map((line) => line.split(/=(.*)/s).slice(0, 2)));
const apiHash = values.NATS_API_PASSWORD_BCRYPT?.replaceAll('$$', '$');
const workerHash = values.NATS_WORKER_PASSWORD_BCRYPT?.replaceAll('$$', '$');
if (!/^[a-z][a-z0-9_]{2,31}$/.test(values.NATS_API_USER ?? '') || !/^[a-z][a-z0-9_]{2,31}$/.test(values.NATS_WORKER_USER ?? '') || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(apiHash ?? '') || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(workerHash ?? '')) throw new Error('Generated NATS identities or bcrypt hashes are invalid.');
const template = await readFile(templatePath, 'utf8');
const rendered = template
  .replace('__NATS_API_USER__', values.NATS_API_USER)
  .replace('__NATS_API_PASSWORD_BCRYPT__', apiHash)
  .replace('__NATS_WORKER_USER__', values.NATS_WORKER_USER)
  .replace('__NATS_WORKER_PASSWORD_BCRYPT__', workerHash);
if (rendered.includes('__NATS_')) throw new Error('NATS configuration template was not fully rendered.');
const temporary = `${outputPath}.tmp`;
await writeFile(temporary, rendered, { encoding: 'utf8', mode: 0o600 });
await chmod(temporary, 0o600);
await rename(temporary, outputPath);
