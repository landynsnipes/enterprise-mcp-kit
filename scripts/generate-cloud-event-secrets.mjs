import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const credential = (user) => {
  const password = randomBytes(36).toString('base64url');
  return { user, password, hash: bcrypt.hashSync(password, 12) };
};
const api = credential('cloud_event_api');
const worker = credential('cloud_event_worker');
const composeSafe = (hash) => hash.replaceAll('$', () => '$$');
process.stdout.write([
  `NATS_API_USER=${api.user}`,
  `NATS_API_PASSWORD=${api.password}`,
  `NATS_API_PASSWORD_BCRYPT=${composeSafe(api.hash)}`,
  `NATS_WORKER_USER=${worker.user}`,
  `NATS_WORKER_PASSWORD=${worker.password}`,
  `NATS_WORKER_PASSWORD_BCRYPT=${composeSafe(worker.hash)}`,
].join('\n') + '\n');
