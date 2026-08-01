import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GovernanceValidationError, type GovernanceSnapshot } from './governance.js';

/** Local development persistence only. Production storage must provide durable access control and append-only audit retention. */
export class FileGovernanceStore {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) { if (!path || path.trim() !== path) throw new GovernanceValidationError('Governance storage path must be a non-empty exact string.'); }
  async load(): Promise<GovernanceSnapshot> {
    try { const value = JSON.parse(await readFile(this.path, 'utf8')) as GovernanceSnapshot | { version: 1; plans: GovernanceSnapshot['plans']; events: GovernanceSnapshot['events'] }; if (value?.version === 1 && Array.isArray(value.plans) && Array.isArray(value.events)) return { version: 2, plans: value.plans, events: value.events, receipts: [] }; if (value?.version !== 2 || !Array.isArray(value.plans) || !Array.isArray(value.events) || !Array.isArray(value.receipts) || !value.receipts.every((item) => exact(item.key) && exact(item.tenantId) && exact(item.actorId) && exact(item.operation) && /^[a-f0-9]{64}$/.test(item.requestDigest) && exact(item.planId) && exact(item.recordedAt))) throw new GovernanceValidationError('Governance storage contains an invalid snapshot.'); return value; }
    catch (error) { if ((error as { code?: string }).code === 'ENOENT') return { version: 2, plans: [], events: [], receipts: [] }; if (error instanceof GovernanceValidationError) throw error; throw new GovernanceValidationError('Governance storage could not be read.'); }
  }
  async save(snapshot: GovernanceSnapshot): Promise<void> {
    if (snapshot.version !== 2) throw new GovernanceValidationError('Governance snapshot version is unsupported.');
    await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 }); await rename(temporary, this.path);
  }
  async transact<T>(operation: (snapshot: GovernanceSnapshot) => Promise<{ snapshot: GovernanceSnapshot; result: T }> | { snapshot: GovernanceSnapshot; result: T }): Promise<T> {
    let resolveResult!: (value: T) => void; let rejectResult!: (reason: unknown) => void;
    const result = new Promise<T>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    this.queue = this.queue.then(async () => { try { const updated = await operation(await this.load()); await this.save(updated.snapshot); resolveResult(updated.result); } catch (error) { rejectResult(error); } });
    await this.queue; return result;
  }
}
function exact(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
