import { BoundedClientError, BoundedConfigurationError, BoundedValidationError, asRecord, bool, exactText, jsonRequest, parseServiceUrl, parseTimeout, text, type FetchLike } from './bounded-http.js';

export interface OpnSenseClientOptions { baseUrl: string; key: string; secret: string; timeoutMs?: number; fetch?: FetchLike; }
export interface OpnSenseInterfaceContext { identity: string; status: string | null; ipv4: string | null; source: string; }
export interface OpnSenseAliasContext { uuid: string; name: string; enabled: boolean; type: string | null; source: string; }
export interface OpnSenseAliasToggleRequest { uuid: string; expectedEnabled: boolean; }
export interface OpnSenseAliasToggleResult { uuid: string; name: string; beforeEnabled: boolean; afterEnabled: boolean; source: string; }
export interface OpnSenseClient {
  getInterfaceContext(input: unknown): Promise<OpnSenseInterfaceContext>;
  getAliasContext(input: unknown): Promise<OpnSenseAliasContext>;
  toggleAlias(input: unknown): Promise<OpnSenseAliasToggleResult>;
}

export class HttpOpnSenseClient implements OpnSenseClient {
  private readonly baseUrl: URL;
  private readonly authorization: string;
  private readonly timeoutMs: number;
  private readonly fetch: FetchLike;

  constructor(options: OpnSenseClientOptions) {
    if (!options || typeof options !== 'object') throw new BoundedConfigurationError('OPNsense client options must be an object.');
    if (typeof options.key !== 'string' || !options.key || options.key.trim() !== options.key) throw new BoundedConfigurationError('OPNsense key must be a non-empty, non-padded string.');
    if (typeof options.secret !== 'string' || !options.secret || options.secret.trim() !== options.secret) throw new BoundedConfigurationError('OPNsense secret must be a non-empty, non-padded string.');
    this.authorization = `Basic ${Buffer.from(`${options.key}:${options.secret}`).toString('base64')}`;
    this.baseUrl = parseServiceUrl(options.baseUrl, 'OPNsense base URL');
    this.timeoutMs = parseTimeout(options.timeoutMs, 'OPNsense timeout');
    if (options.fetch !== undefined && typeof options.fetch !== 'function') throw new BoundedConfigurationError('OPNsense fetch must be a function when supplied.');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async getInterfaceContext(input: unknown): Promise<OpnSenseInterfaceContext> {
    const identity = exactKey(input, 'identity');
    const payload = asRecord(await this.request('api/diagnostics/interface/getInterfaceStatistics', 'GET'), 'OPNsense');
    const statistics = asRecord(payload.statistics ?? payload, 'OPNsense');
    const match = statistics[identity];
    if (match === undefined) throw new BoundedClientError('OPNsense interface was not found.');
    const record = asRecord(match, 'OPNsense');
    return { identity, status: text(record.status) ?? text(record['if']), ipv4: text(record.ipv4) ?? text(record['ipaddr']), source: 'api/diagnostics/interface/getInterfaceStatistics' };
  }

  async getAliasContext(input: unknown): Promise<OpnSenseAliasContext> {
    const uuid = exactKey(input, 'uuid');
    return this.readAlias(uuid);
  }

  async toggleAlias(input: unknown): Promise<OpnSenseAliasToggleResult> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('Alias toggle request must be an object.');
    const record = input as Record<string, unknown>;
    const uuid = exactText(record.uuid, 'uuid');
    if (typeof record.expectedEnabled !== 'boolean') throw new BoundedValidationError('expectedEnabled must be a boolean.');
    const before = await this.readAlias(uuid);
    if (before.enabled !== record.expectedEnabled) throw new BoundedClientError('OPNsense alias changed after the plan was created.');
    await this.request(`api/firewall/alias/toggleItem/${encodeURIComponent(uuid)}`, 'POST', {});
    const after = await this.readAlias(uuid);
    if (after.enabled === before.enabled) throw new BoundedClientError('OPNsense did not verify the approved alias toggle.');
    return { uuid, name: after.name, beforeEnabled: before.enabled, afterEnabled: after.enabled, source: `api/firewall/alias/toggleItem/${uuid}` };
  }

  private async readAlias(uuid: string): Promise<OpnSenseAliasContext> {
    const payload = asRecord(await this.request(`api/firewall/alias/getItem/${encodeURIComponent(uuid)}`, 'GET', undefined, 'OPNsense alias was not found.'), 'OPNsense');
    const alias = asRecord(payload.alias ?? payload, 'OPNsense');
    const enabled = bool(alias.enabled) ?? text(alias.enabled) === '1';
    return { uuid, name: text(alias.name) ?? uuid, enabled, type: text(alias.type), source: `api/firewall/alias/getItem/${uuid}` };
  }

  private request(path: string, method: 'GET' | 'POST', body?: unknown, notFoundMessage?: string): Promise<unknown> {
    return jsonRequest({
      baseUrl: this.baseUrl, path, method, body, timeoutMs: this.timeoutMs, fetch: this.fetch, system: 'OPNsense',
      ...(notFoundMessage === undefined ? {} : { notFoundMessage }),
      headers: { Authorization: this.authorization },
    });
  }
}

function exactKey(input: unknown, key: string): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError(`${key} lookup must be an object.`);
  const record = input as Record<string, unknown>;
  if (Object.keys(record).join() !== key) throw new BoundedValidationError(`Provide exactly one ${key}.`);
  return exactText(record[key], key);
}
