import { BoundedClientError, BoundedConfigurationError, BoundedValidationError, asRecord, exactText, jsonRequest, parseServiceUrl, parseTimeout, positiveInt, text, type FetchLike } from './bounded-http.js';

export interface ZabbixClientOptions { baseUrl: string; token: string; timeoutMs?: number; fetch?: FetchLike; }
export interface ZabbixHostContext { hostId: string; host: string; name: string; status: string; inventoryOs: string | null; source: string; }
export interface ZabbixProblemContext { eventId: string; name: string; severity: string | null; acknowledged: boolean; clock: string | null; host: string | null; source: string; }
export interface ZabbixAcknowledgeRequest { eventId: number; message: string; expectedAcknowledged: boolean; }
export interface ZabbixAcknowledgeResult { eventId: string; beforeAcknowledged: boolean; afterAcknowledged: boolean; message: string; source: string; }
export interface ZabbixClient {
  getHostContext(input: unknown): Promise<ZabbixHostContext>;
  getProblemContext(input: unknown): Promise<ZabbixProblemContext>;
  acknowledgeProblem(input: unknown): Promise<ZabbixAcknowledgeResult>;
}

export class HttpZabbixClient implements ZabbixClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetch: FetchLike;
  private rpcId = 1;

  constructor(options: ZabbixClientOptions) {
    if (!options || typeof options !== 'object') throw new BoundedConfigurationError('Zabbix client options must be an object.');
    if (typeof options.token !== 'string' || !options.token || options.token.trim() !== options.token) throw new BoundedConfigurationError('Zabbix token must be a non-empty, non-padded string.');
    this.token = options.token;
    this.baseUrl = parseServiceUrl(options.baseUrl, 'Zabbix base URL');
    this.timeoutMs = parseTimeout(options.timeoutMs, 'Zabbix timeout');
    if (options.fetch !== undefined && typeof options.fetch !== 'function') throw new BoundedConfigurationError('Zabbix fetch must be a function when supplied.');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async getHostContext(input: unknown): Promise<ZabbixHostContext> {
    const host = exactLookup(input, 'host');
    const result = await this.rpc('host.get', { filter: { host: [host] }, output: ['hostid', 'host', 'name', 'status'], selectInventory: ['os'] });
    const rows = Array.isArray(result) ? result : [];
    const exact = rows.filter((row) => text(asRecord(row, 'Zabbix').host) === host);
    if (exact.length === 0) throw new BoundedClientError('Zabbix host was not found.');
    if (exact.length > 1) throw new BoundedClientError('Zabbix host lookup is ambiguous.');
    const record = asRecord(exact[0], 'Zabbix');
    const inventory = record.inventory && typeof record.inventory === 'object' ? asRecord(record.inventory, 'Zabbix') : {};
    return {
      hostId: text(record.hostid) ?? '',
      host,
      name: text(record.name) ?? host,
      status: text(record.status) === '0' ? 'enabled' : 'disabled',
      inventoryOs: text(inventory.os),
      source: 'host.get',
    };
  }

  async getProblemContext(input: unknown): Promise<ZabbixProblemContext> {
    const eventId = String(eventLookup(input));
    const result = await this.rpc('problem.get', { eventids: [eventId], output: ['eventid', 'name', 'severity', 'acknowledged', 'clock'], selectHosts: ['host'] });
    const rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) throw new BoundedClientError('Zabbix problem was not found.');
    if (rows.length > 1) throw new BoundedClientError('Zabbix problem lookup is ambiguous.');
    return this.mapProblem(asRecord(rows[0], 'Zabbix'));
  }

  async acknowledgeProblem(input: unknown): Promise<ZabbixAcknowledgeResult> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('Acknowledge request must be an object.');
    const record = input as Record<string, unknown>;
    const eventId = positiveInt(record.eventId, 'eventId');
    const message = exactText(record.message, 'message');
    if (message.length > 500) throw new BoundedValidationError('message must be 500 characters or fewer.');
    if (record.expectedAcknowledged !== false) throw new BoundedValidationError('expectedAcknowledged must be false for an acknowledge write.');
    const before = await this.getProblemContext({ eventId });
    if (before.acknowledged) throw new BoundedClientError('Zabbix problem changed after the plan was created.');
    await this.rpc('event.acknowledge', { eventids: [String(eventId)], action: 2, message });
    const after = await this.getProblemContext({ eventId });
    if (!after.acknowledged) throw new BoundedClientError('Zabbix did not verify the approved acknowledgement.');
    return { eventId: String(eventId), beforeAcknowledged: false, afterAcknowledged: true, message, source: 'event.acknowledge' };
  }

  private mapProblem(record: Record<string, unknown>): ZabbixProblemContext {
    const hosts = Array.isArray(record.hosts) ? record.hosts : [];
    const host = hosts[0] && typeof hosts[0] === 'object' ? text(asRecord(hosts[0], 'Zabbix').host) : null;
    return {
      eventId: text(record.eventid) ?? '',
      name: text(record.name) ?? 'unavailable',
      severity: text(record.severity),
      acknowledged: text(record.acknowledged) === '1' || record.acknowledged === true,
      clock: text(record.clock),
      host,
      source: 'problem.get',
    };
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const payload = asRecord(await jsonRequest({
      baseUrl: this.baseUrl,
      path: 'api_jsonrpc.php',
      method: 'POST',
      timeoutMs: this.timeoutMs,
      fetch: this.fetch,
      system: 'Zabbix',
      headers: { Authorization: `Bearer ${this.token}` },
      body: { jsonrpc: '2.0', method, params, id: this.rpcId++, auth: this.token },
    }), 'Zabbix');
    if (payload.error) throw new BoundedClientError('Zabbix request failed.');
    return payload.result;
  }
}

function exactLookup(input: unknown, key: string): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError(`${key} lookup must be an object.`);
  const record = input as Record<string, unknown>;
  if (Object.keys(record).join() !== key) throw new BoundedValidationError(`Provide exactly one ${key}.`);
  return exactText(record[key], key);
}

function eventLookup(input: unknown): number {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('eventId lookup must be an object.');
  const record = input as Record<string, unknown>;
  if (Object.keys(record).join() !== 'eventId') throw new BoundedValidationError('Provide exactly one eventId.');
  return positiveInt(record.eventId, 'eventId');
}
