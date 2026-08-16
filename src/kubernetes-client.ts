import { BoundedClientError, BoundedConfigurationError, BoundedValidationError, asRecord, exactText, integer, jsonRequest, parseServiceUrl, parseTimeout, positiveInt, text, type FetchLike } from './bounded-http.js';

export interface KubernetesClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetch?: FetchLike;
  admittedNamespaces?: readonly string[];
  maxReplicas?: number;
}
export interface WorkloadContext {
  namespace: string;
  name: string;
  kind: 'Deployment';
  replicas: number | null;
  readyReplicas: number | null;
  resourceVersion: string;
  source: string;
}
export interface ReplicaScaleRequest { namespace: string; name: string; expectedReplicas: number; replicas: number; expectedResourceVersion: string; }
export interface ReplicaScaleResult { namespace: string; name: string; beforeReplicas: number; afterReplicas: number; resourceVersion: string; source: string; }
export interface KubernetesClient {
  getWorkloadContext(input: unknown): Promise<WorkloadContext>;
  setWorkloadReplicas(input: unknown): Promise<ReplicaScaleResult>;
}

export class HttpKubernetesClient implements KubernetesClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetch: FetchLike;
  private readonly admittedNamespaces: readonly string[];
  private readonly maxReplicas: number;

  constructor(options: KubernetesClientOptions) {
    if (!options || typeof options !== 'object') throw new BoundedConfigurationError('Kubernetes client options must be an object.');
    if (typeof options.token !== 'string' || !options.token || options.token.trim() !== options.token) throw new BoundedConfigurationError('Kubernetes token must be a non-empty, non-padded string.');
    this.token = options.token;
    this.baseUrl = parseServiceUrl(options.baseUrl, 'Kubernetes base URL');
    this.timeoutMs = parseTimeout(options.timeoutMs, 'Kubernetes timeout');
    if (options.fetch !== undefined && typeof options.fetch !== 'function') throw new BoundedConfigurationError('Kubernetes fetch must be a function when supplied.');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.admittedNamespaces = options.admittedNamespaces ?? [];
    this.maxReplicas = options.maxReplicas ?? 50;
    if (!Number.isInteger(this.maxReplicas) || this.maxReplicas < 1 || this.maxReplicas > 100) throw new BoundedConfigurationError('Kubernetes maxReplicas must be an integer from 1 to 100.');
  }

  async getWorkloadContext(input: unknown): Promise<WorkloadContext> {
    const lookup = this.workloadLookup(input);
    const record = asRecord(await this.request(path(lookup), 'GET', undefined, 'Kubernetes workload was not found.'), 'Kubernetes');
    return this.map(record, lookup);
  }

  async setWorkloadReplicas(input: unknown): Promise<ReplicaScaleResult> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('Replica scale request must be an object.');
    const record = input as Record<string, unknown>;
    const lookup = this.workloadLookup({ namespace: record.namespace, name: record.name });
    const expectedReplicas = positiveInt(record.expectedReplicas, 'expectedReplicas');
    const replicas = positiveInt(record.replicas, 'replicas');
    const expectedResourceVersion = exactText(record.expectedResourceVersion, 'expectedResourceVersion');
    if (expectedReplicas === replicas) throw new BoundedValidationError('replicas must differ from expectedReplicas.');
    if (replicas > this.maxReplicas) throw new BoundedValidationError(`replicas must be ${this.maxReplicas} or fewer.`);
    const before = await this.getWorkloadContext(lookup);
    if (before.replicas !== expectedReplicas || before.resourceVersion !== expectedResourceVersion) {
      throw new BoundedClientError('Kubernetes workload changed after the plan was created.');
    }
    const after = asRecord(await this.request(path(lookup), 'PATCH', {
      metadata: { resourceVersion: expectedResourceVersion },
      spec: { replicas },
    }, 'Kubernetes workload was not found.'), 'Kubernetes');
    const mapped = this.map(after, lookup);
    if (mapped.replicas !== replicas) throw new BoundedClientError('Kubernetes did not verify the approved replica change.');
    return { namespace: lookup.namespace, name: lookup.name, beforeReplicas: expectedReplicas, afterReplicas: replicas, resourceVersion: mapped.resourceVersion, source: mapped.source };
  }

  private map(record: Record<string, unknown>, lookup: { namespace: string; name: string }): WorkloadContext {
    const metadata = asRecord(record.metadata ?? {}, 'Kubernetes');
    const spec = asRecord(record.spec ?? {}, 'Kubernetes');
    const status = asRecord(record.status ?? {}, 'Kubernetes');
    if (text(metadata.name) !== lookup.name) throw new BoundedClientError('Kubernetes workload lookup is ambiguous.');
    const resourceVersion = text(metadata.resourceVersion);
    if (!resourceVersion) throw new BoundedClientError('Kubernetes returned incomplete workload version evidence.');
    return {
      namespace: lookup.namespace,
      name: lookup.name,
      kind: 'Deployment',
      replicas: integer(spec.replicas),
      readyReplicas: integer(status.readyReplicas),
      resourceVersion,
      source: path(lookup),
    };
  }

  private workloadLookup(input: unknown): { namespace: string; name: string } {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('Workload lookup must be an object.');
    const record = input as Record<string, unknown>;
    const namespace = exactText(record.namespace, 'namespace');
    const name = exactText(record.name, 'name');
    if (this.admittedNamespaces.length > 0 && !this.admittedNamespaces.includes(namespace)) {
      throw new BoundedValidationError('namespace is outside the admitted Kubernetes workload scope.');
    }
    const extra = Object.keys(record).filter((key) => !['namespace', 'name'].includes(key));
    if (extra.length) throw new BoundedValidationError('Workload lookup contains unknown fields.');
    return { namespace, name };
  }

  private request(pathValue: string, method: 'GET' | 'PATCH', body: unknown, notFoundMessage: string): Promise<unknown> {
    return jsonRequest({
      baseUrl: this.baseUrl, path: pathValue, method, body, timeoutMs: this.timeoutMs, fetch: this.fetch, system: 'Kubernetes', notFoundMessage,
      headers: { Authorization: `Bearer ${this.token}`, ...(method === 'PATCH' ? { 'Content-Type': 'application/strategic-merge-patch+json' } : {}) },
    });
  }
}

function path(lookup: { namespace: string; name: string }): string {
  return `apis/apps/v1/namespaces/${encodeURIComponent(lookup.namespace)}/deployments/${encodeURIComponent(lookup.name)}`;
}
