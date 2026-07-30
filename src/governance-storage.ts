import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GovernanceValidationError, type GovernanceSnapshot } from './governance.js';

/** Local development persistence only. Production storage must provide durable access control and append-only audit retention. */
export class FileGovernanceStore {
  constructor(private readonly path: string) { if (!path || path.trim() !== path) throw new GovernanceValidationError('Governance storage path must be a non-empty exact string.'); }
  async load(): Promise<GovernanceSnapshot> {
    try { const value = JSON.parse(await readFile(this.path, 'utf8')) as GovernanceSnapshot; if (value?.version !== 1 || !Array.isArray(value.plans) || !Array.isArray(value.events)) throw new GovernanceValidationError('Governance storage contains an invalid snapshot.'); return value; }
    catch (error) { if ((error as { code?: string }).code === 'ENOENT') return { version: 1, plans: [], events: [] }; if (error instanceof GovernanceValidationError) throw error; throw new GovernanceValidationError('Governance storage could not be read.'); }
  }
  async save(snapshot: GovernanceSnapshot): Promise<void> {
    if (snapshot.version !== 1) throw new GovernanceValidationError('Governance snapshot version is unsupported.');
    await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 }); await rename(temporary, this.path);
  }
}
