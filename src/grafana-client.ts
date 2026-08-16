import { BoundedClientError, BoundedConfigurationError, BoundedValidationError, asRecord, bool, exactText, jsonRequest, parseServiceUrl, parseTimeout, text, type FetchLike } from './bounded-http.js';

export interface GrafanaClientOptions { baseUrl: string; token: string; timeoutMs?: number; fetch?: FetchLike; }
export interface GrafanaDashboardContext { uid: string; title: string; folderTitle: string | null; tags: string[]; version: number | null; url: string | null; source: string; }
export interface GrafanaAlertRuleContext { uid: string; title: string; folderUid: string | null; isPaused: boolean; updated: string | null; provenance: string | null; source: string; }
export interface GrafanaAlertPauseRequest { uid: string; expectedPaused: boolean; paused: boolean; }
export interface GrafanaAlertPauseResult { uid: string; title: string; beforePaused: boolean; afterPaused: boolean; updated: string | null; source: string; }
export interface GrafanaClient {
  getDashboardContext(input: unknown): Promise<GrafanaDashboardContext>;
  getAlertRuleContext(input: unknown): Promise<GrafanaAlertRuleContext>;
  setAlertRulePaused(input: unknown): Promise<GrafanaAlertPauseResult>;
}

export function validateUid(input: unknown, label = 'uid'): { uid: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError(`${label} lookup must be an object.`);
  const record = input as Record<string, unknown>;
  if (Object.keys(record).join() !== 'uid') throw new BoundedValidationError('Provide exactly one uid.');
  return { uid: exactText(record.uid, label) };
}

export class HttpGrafanaClient implements GrafanaClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetch: FetchLike;

  constructor(options: GrafanaClientOptions) {
    if (!options || typeof options !== 'object') throw new BoundedConfigurationError('Grafana client options must be an object.');
    this.token = exactToken(options.token, 'Grafana token');
    this.baseUrl = parseServiceUrl(options.baseUrl, 'Grafana base URL');
    this.timeoutMs = parseTimeout(options.timeoutMs, 'Grafana timeout');
    if (options.fetch !== undefined && typeof options.fetch !== 'function') throw new BoundedConfigurationError('Grafana fetch must be a function when supplied.');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async getDashboardContext(input: unknown): Promise<GrafanaDashboardContext> {
    const { uid } = validateUid(input, 'Dashboard uid');
    const payload = asRecord(await this.request(`api/dashboards/uid/${encodeURIComponent(uid)}`, 'GET', undefined, 'Grafana dashboard was not found.'), 'Grafana');
    const meta = asRecord(payload.meta ?? {}, 'Grafana');
    const dashboard = asRecord(payload.dashboard ?? payload, 'Grafana');
    const returnedUid = text(dashboard.uid);
    if (returnedUid !== uid) throw new BoundedClientError('Grafana dashboard lookup is ambiguous.');
    const version = typeof dashboard.version === 'number' && Number.isInteger(dashboard.version) ? dashboard.version : null;
    const tags = Array.isArray(dashboard.tags) ? dashboard.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20) : [];
    return { uid, title: text(dashboard.title) ?? uid, folderTitle: text(meta.folderTitle), tags, version, url: text(meta.url), source: `api/dashboards/uid/${uid}` };
  }

  async getAlertRuleContext(input: unknown): Promise<GrafanaAlertRuleContext> {
    return this.readAlertRule(validateUid(input, 'Alert rule uid').uid);
  }

  async setAlertRulePaused(input: unknown): Promise<GrafanaAlertPauseResult> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('Alert pause request must be an object.');
    const record = input as Record<string, unknown>;
    const uid = exactText(record.uid, 'Alert rule uid');
    if (typeof record.expectedPaused !== 'boolean' || typeof record.paused !== 'boolean') throw new BoundedValidationError('expectedPaused and paused must be booleans.');
    if (record.expectedPaused === record.paused) throw new BoundedValidationError('paused must differ from expectedPaused.');
    const before = asRecord(await this.request(`api/v1/provisioning/alert-rules/${encodeURIComponent(uid)}`, 'GET', undefined, 'Grafana alert rule was not found.'), 'Grafana');
    if (bool(before.isPaused) !== record.expectedPaused) throw new BoundedClientError('Grafana alert rule changed after the plan was created.');
    const after = asRecord(await this.request(`api/v1/provisioning/alert-rules/${encodeURIComponent(uid)}`, 'PUT', { ...before, isPaused: record.paused }, 'Grafana alert rule was not found.'), 'Grafana');
    if (bool(after.isPaused) !== record.paused) throw new BoundedClientError('Grafana did not verify the approved pause change.');
    return { uid, title: text(after.title) ?? text(before.title) ?? uid, beforePaused: record.expectedPaused, afterPaused: record.paused, updated: text(after.updated), source: `api/v1/provisioning/alert-rules/${uid}` };
  }

  private async readAlertRule(uid: string): Promise<GrafanaAlertRuleContext> {
    const rule = asRecord(await this.request(`api/v1/provisioning/alert-rules/${encodeURIComponent(uid)}`, 'GET', undefined, 'Grafana alert rule was not found.'), 'Grafana');
    if (text(rule.uid) !== uid) throw new BoundedClientError('Grafana alert rule lookup is ambiguous.');
    const isPaused = bool(rule.isPaused);
    if (isPaused === null) throw new BoundedClientError('Grafana returned incomplete alert-rule evidence.');
    return { uid, title: text(rule.title) ?? uid, folderUid: text(rule.folderUID) ?? text(rule.folderUid), isPaused, updated: text(rule.updated), provenance: text(rule.provenance), source: `api/v1/provisioning/alert-rules/${uid}` };
  }

  private request(path: string, method: 'GET' | 'PUT', body: unknown, notFoundMessage: string): Promise<unknown> {
    return jsonRequest({
      baseUrl: this.baseUrl, path, method, body, timeoutMs: this.timeoutMs, fetch: this.fetch, system: 'Grafana', notFoundMessage,
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }
}

function exactToken(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value) throw new BoundedConfigurationError(`${label} must be a non-empty, non-padded string.`);
  return value;
}
