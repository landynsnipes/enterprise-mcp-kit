import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BoundedClientError, BoundedValidationError, exactText } from './bounded-http.js';

const run = promisify(execFile);

export interface AnsibleRunRequest { playbookId: string; mode: 'check' | 'apply'; }
export interface AnsibleRunResult { playbookId: string; mode: 'check' | 'apply'; changed: boolean; source: string; }
export interface AnsibleExecutor { runAdmittedPlaybook(input: unknown): Promise<AnsibleRunResult>; }
export interface LocalAnsibleExecutorOptions {
  playbooks: Record<string, string>;
  binary?: string;
  inventory?: string;
  connection?: string;
}

export class LocalAnsibleExecutor implements AnsibleExecutor {
  constructor(private readonly options: LocalAnsibleExecutorOptions) {
    if (!options?.playbooks || typeof options.playbooks !== 'object') throw new BoundedValidationError('Ansible playbook map is required.');
  }

  async runAdmittedPlaybook(input: unknown): Promise<AnsibleRunResult> {
    const request = this.parseRun(input);
    const playbook = this.options.playbooks[request.playbookId];
    const args = [
      '--inventory', this.options.inventory ?? 'localhost,',
      '--connection', this.options.connection ?? 'local',
      ...(request.mode === 'check' ? ['--check'] : []),
      playbook,
    ];
    try {
      const { stdout } = await run(this.options.binary ?? '/usr/bin/ansible-playbook', args, { timeout: 60_000, maxBuffer: 256 * 1024 });
      return { playbookId: request.playbookId, mode: request.mode, changed: /\bchanged=([1-9]\d*)\b/.test(stdout), source: playbook };
    } catch (error) {
      if (error instanceof BoundedClientError) throw error;
      throw new BoundedClientError('Ansible admitted playbook failed.');
    }
  }

  private parseRun(input: unknown): AnsibleRunRequest {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('Ansible run request must be an object.');
    const record = input as Record<string, unknown>;
    const playbookId = exactText(record.playbookId, 'playbookId');
    if (!(playbookId in this.options.playbooks)) throw new BoundedValidationError('playbookId is outside the admitted Ansible set.');
    if (record.mode !== 'check' && record.mode !== 'apply') throw new BoundedValidationError('mode must be check or apply.');
    return { playbookId, mode: record.mode };
  }
}
