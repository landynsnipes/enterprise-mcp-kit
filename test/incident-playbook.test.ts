import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveIncidentPlaybook } from '../src/aiops-incident.js';

test('incident playbook resolves inside the repository, not a personal homedir', () => {
  const previous = process.env.INCIDENT_PLAYBOOK;
  delete process.env.INCIDENT_PLAYBOOK;
  try {
    const playbook = resolveIncidentPlaybook();
    assert.equal(path.isAbsolute(playbook), true);
    assert.equal(existsSync(playbook), true);
    assert.match(playbook.replaceAll('\\', '/'), /ansible\/incidents\/restart-wireguard-observer\.yml$/);
  } finally {
    if (previous === undefined) delete process.env.INCIDENT_PLAYBOOK;
    else process.env.INCIDENT_PLAYBOOK = previous;
  }
});

test('INCIDENT_PLAYBOOK must be an existing absolute path', () => {
  assert.throws(() => resolveIncidentPlaybook('ansible/incidents/restart-wireguard-observer.yml'), /absolute path/);
});
