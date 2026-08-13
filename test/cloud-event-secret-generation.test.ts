import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import bcrypt from 'bcryptjs';

test('generates distinct API and worker credentials with matching bcrypt hashes', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-cloud-event-secrets.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const values = Object.fromEntries(result.stdout.trim().split('\n').map((line) => line.split(/=(.*)/s).slice(0, 2)));
  assert.equal(values.NATS_API_USER, 'cloud_event_api');
  assert.equal(values.NATS_WORKER_USER, 'cloud_event_worker');
  assert.notEqual(values.NATS_API_PASSWORD, values.NATS_WORKER_PASSWORD);
  const apiHash = values.NATS_API_PASSWORD_BCRYPT.replaceAll('$$', '$');
  const workerHash = values.NATS_WORKER_PASSWORD_BCRYPT.replaceAll('$$', '$');
  assert.equal(bcrypt.compareSync(values.NATS_API_PASSWORD, apiHash), true);
  assert.equal(bcrypt.compareSync(values.NATS_WORKER_PASSWORD, workerHash), true);
  assert.match(values.NATS_API_PASSWORD_BCRYPT, /^\$\$2[aby]\$\$12\$\$/);
  assert.match(values.NATS_WORKER_PASSWORD_BCRYPT, /^\$\$2[aby]\$\$12\$\$/);
});
