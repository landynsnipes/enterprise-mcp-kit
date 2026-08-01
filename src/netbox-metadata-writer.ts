export const reconciliationStatuses = ['matched', 'drifted', 'missing-observation', 'exception', 'not-evaluated'] as const;
export type ReconciliationStatus = typeof reconciliationStatuses[number];
export const deviceMetadataFields = ['reconciliation_status', 'observed_software_version', 'minimum_approved_version'] as const;
export type DeviceMetadataField = typeof deviceMetadataFields[number];
export type DeviceMetadataValue = ReconciliationStatus | string | null;

export interface DeviceMetadataChange {
  field: DeviceMetadataField;
  expectedValue: DeviceMetadataValue;
  newValue: DeviceMetadataValue;
  expectedLastUpdated: string;
}
export interface DeviceMetadataWriteRequest extends DeviceMetadataChange { deviceId: number; tenantId: string; }
export interface DeviceMetadataWriteResult {
  deviceId: number; deviceName: string; tenantId: string; field: DeviceMetadataField;
  beforeValue: DeviceMetadataValue; afterValue: DeviceMetadataValue;
  beforeLastUpdated: string; afterLastUpdated: string; source: string;
}

type Fetch = (input: URL | string, init?: RequestInit) => Promise<Response>;
export interface NetBoxMetadataWriterOptions { baseUrl: string; token: string; timeoutMs?: number; fetch?: Fetch; }
export class NetBoxWriteError extends Error { constructor(message: string) { super(message); this.name = 'NetBoxWriteError'; } }

/** A deliberately non-generic writer for one reversible custom-field change. */
export class NetBoxDeviceMetadataWriter {
  private readonly baseUrl: URL; private readonly token: string; private readonly timeoutMs: number; private readonly fetch: Fetch;
  constructor(options: NetBoxMetadataWriterOptions) {
    if (!options || !exact(options.baseUrl) || !exact(options.token)) throw new NetBoxWriteError('NetBox write configuration is invalid.');
    try { this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`); } catch { throw new NetBoxWriteError('NetBox write base URL is invalid.'); }
    if (!['http:', 'https:'].includes(this.baseUrl.protocol) || this.baseUrl.username || this.baseUrl.password) throw new NetBoxWriteError('NetBox write base URL is invalid.');
    this.token = options.token; this.timeoutMs = options.timeoutMs ?? 5_000; this.fetch = options.fetch ?? globalThis.fetch;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || (options.fetch !== undefined && typeof options.fetch !== 'function')) throw new NetBoxWriteError('NetBox write configuration is invalid.');
  }
  async updateDeviceMetadata(input: DeviceMetadataWriteRequest): Promise<DeviceMetadataWriteResult> {
    validate(input); const path = `api/dcim/devices/${input.deviceId}/`; const before = await this.request(path, 'GET');
    const name = text(before.name); const tenant = nested(before, 'tenant', 'slug'); const lastUpdated = text(before.last_updated); const current = customValue(before, input.field);
    if (!name || !lastUpdated) throw new NetBoxWriteError('NetBox returned incomplete device version evidence.');
    if (tenant !== input.tenantId) throw new NetBoxWriteError('NetBox device is outside the approved tenant scope.');
    if (lastUpdated !== input.expectedLastUpdated || current !== input.expectedValue) throw new NetBoxWriteError('NetBox device changed after the plan was created.');
    const after = await this.request(path, 'PATCH', { custom_fields: { [input.field]: input.newValue } }); const afterValue = customValue(after, input.field); const afterUpdated = text(after.last_updated);
    if (afterValue !== input.newValue || !afterUpdated) throw new NetBoxWriteError('NetBox did not verify the approved metadata change.');
    return { deviceId: input.deviceId, deviceName: name, tenantId: input.tenantId, field: input.field, beforeValue: current, afterValue, beforeLastUpdated: lastUpdated, afterLastUpdated: afterUpdated, source: text(after.url) ?? path };
  }
  async updateReconciliationStatus(input: DeviceMetadataWriteRequest): Promise<DeviceMetadataWriteResult> { return this.updateDeviceMetadata(input); }
  private async request(path: string, method: 'GET' | 'PATCH', body?: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try { const response = await this.fetch(new URL(path, this.baseUrl), { method, headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal }); if (!response.ok) throw new NetBoxWriteError(statusMessage(response.status)); try { return await response.json() as Record<string, unknown>; } catch { throw new NetBoxWriteError('NetBox returned invalid JSON.'); } }
    catch (error) { if (error instanceof NetBoxWriteError) throw error; if ((error as { name?: string }).name === 'AbortError') throw new NetBoxWriteError('NetBox write request timed out.'); throw new NetBoxWriteError('NetBox write request failed.'); } finally { clearTimeout(timer); }
  }
}
function validate(input: DeviceMetadataWriteRequest): void { const statusField = input?.field === 'reconciliation_status'; const validStatus = (value: unknown) => value === null || (typeof value === 'string' && reconciliationStatuses.includes(value as ReconciliationStatus)); const validVersion = (value: unknown) => value === null || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+:-]{0,63}$/.test(value)); if (!input || !Number.isInteger(input.deviceId) || input.deviceId < 1 || !exact(input.tenantId) || !deviceMetadataFields.includes(input.field) || !(statusField ? validStatus(input.expectedValue) && validStatus(input.newValue) : validVersion(input.expectedValue) && validVersion(input.newValue)) || input.expectedValue === input.newValue || !exact(input.expectedLastUpdated) || Number.isNaN(Date.parse(input.expectedLastUpdated))) throw new NetBoxWriteError('Approved device metadata change is invalid.'); }
function customValue(record: Record<string, unknown>, field: DeviceMetadataField): DeviceMetadataValue { const value = (record.custom_fields as Record<string, unknown> | undefined)?.[field]; return typeof value === 'string' ? value : null; }
function nested(record: Record<string, unknown>, key: string, field: string): string | null { return text((record[key] as Record<string, unknown> | null)?.[field]); }
function text(value: unknown): string | null { return typeof value === 'string' ? value : null; }
function exact(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function statusMessage(status: number): string { if (status === 401) return 'NetBox write request was not authenticated.'; if (status === 403) return 'NetBox write request was not authorized.'; if (status === 404) return 'NetBox device was not found.'; if (status === 409) return 'NetBox rejected a conflicting write.'; if (status === 429) return 'NetBox write request was rate limited.'; if (status >= 500) return 'NetBox service is unavailable.'; return 'NetBox write request failed.'; }
