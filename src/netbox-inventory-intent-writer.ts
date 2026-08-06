/**
 * Narrow, tenant-scoped inventory writes used only by the authenticated
 * governance gateway.  This is intentionally not a generic NetBox proxy:
 * every action maps to one fixed endpoint and one allowlisted payload.
 */
export const inventoryIntentActions = [
  'ip-address-reassign',
  'device-lifecycle-change',
  'interface-intent-update',
  'rack-placement-update',
  'device-decommission',
] as const;
export type InventoryIntentAction = typeof inventoryIntentActions[number];
export type InventoryTargetKind = 'netbox-ip-address' | 'netbox-device' | 'netbox-interface';

export interface InventoryIntent {
  action: InventoryIntentAction;
  targetKind: InventoryTargetKind;
  targetId: number;
  tenantId: string;
  expectedLastUpdated: string;
  expected: Record<string, unknown>;
  desired: Record<string, unknown>;
}

export interface InventoryIntentWriteResult {
  recordType: InventoryTargetKind;
  recordId: number;
  tenantId: string;
  action: InventoryIntentAction;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  beforeLastUpdated: string;
  afterLastUpdated: string;
  source: string;
}

type Fetch = (input: URL | string, init?: RequestInit) => Promise<Response>;
export class NetBoxInventoryIntentError extends Error { constructor(message: string) { super(message); this.name = 'NetBoxInventoryIntentError'; } }

export class NetBoxInventoryIntentWriter {
  private readonly base: URL;
  private readonly timeout: number;
  private readonly fetch: Fetch;

  constructor(private readonly options: { baseUrl: string; token: string; timeoutMs?: number; fetch?: Fetch }) {
    if (!exact(options?.baseUrl) || !exact(options?.token)) throw new NetBoxInventoryIntentError('NetBox inventory-write configuration is invalid.');
    try { this.base = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`); } catch { throw new NetBoxInventoryIntentError('NetBox inventory-write base URL is invalid.'); }
    if (!['http:', 'https:'].includes(this.base.protocol) || this.base.username || this.base.password) throw new NetBoxInventoryIntentError('NetBox inventory-write base URL is invalid.');
    this.timeout = options.timeoutMs ?? 5_000; this.fetch = options.fetch ?? globalThis.fetch;
    if (!Number.isInteger(this.timeout) || this.timeout < 1 || this.timeout > 30_000 || typeof this.fetch !== 'function') throw new NetBoxInventoryIntentError('NetBox inventory-write configuration is invalid.');
  }

  async execute(input: InventoryIntent): Promise<InventoryIntentWriteResult> {
    validate(input);
    const { path, payload, fields } = route(input);
    const before = await this.request(path, 'GET');
    const beforeLastUpdated = text(before.last_updated);
    if (!beforeLastUpdated || beforeLastUpdated !== input.expectedLastUpdated) throw new NetBoxInventoryIntentError('NetBox record changed after the plan was created.');
    await this.assertTenant(before, input);
    const current = pick(before, fields);
    if (!same(current, input.expected)) throw new NetBoxInventoryIntentError('NetBox record no longer matches the approved precondition.');
    const updated = await this.request(path, 'PATCH', payload);
    const afterLastUpdated = text(updated.last_updated);
    const after = pick(updated, fields);
    if (!afterLastUpdated || !same(after, input.desired)) throw new NetBoxInventoryIntentError('NetBox did not verify the approved inventory change.');
    return { recordType: input.targetKind, recordId: input.targetId, tenantId: input.tenantId, action: input.action, before: current, after, beforeLastUpdated, afterLastUpdated, source: text(updated.url) ?? path };
  }

  private async assertTenant(record: Record<string, unknown>, input: InventoryIntent): Promise<void> {
    let tenant = nested(record, 'tenant', 'slug');
    if (!tenant && input.targetKind === 'netbox-interface') {
      const deviceId = numberId(record.device);
      if (!deviceId) throw new NetBoxInventoryIntentError('NetBox interface did not include a device ownership reference.');
      tenant = nested(await this.request(`api/dcim/devices/${deviceId}/`, 'GET'), 'tenant', 'slug');
    }
    if (tenant !== input.tenantId) throw new NetBoxInventoryIntentError('NetBox record is outside the approved tenant scope.');
  }

  private async request(path: string, method: 'GET' | 'PATCH', body?: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetch(new URL(path, this.base), { method, headers: { Authorization: `Bearer ${this.options.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (!response.ok) throw new NetBoxInventoryIntentError(statusMessage(response.status));
      return await response.json() as Record<string, unknown>;
    } catch (error) {
      if (error instanceof NetBoxInventoryIntentError) throw error;
      throw new NetBoxInventoryIntentError((error as { name?: string }).name === 'AbortError' ? 'NetBox inventory-write request timed out.' : 'NetBox inventory-write request failed.');
    } finally { clearTimeout(timer); }
  }
}

function route(input: InventoryIntent): { path: string; payload: Record<string, unknown>; fields: string[] } {
  switch (input.action) {
    case 'ip-address-reassign': return { path: `api/ipam/ip-addresses/${input.targetId}/`, payload: { assigned_object_type: input.desired.assigned_object_type, assigned_object_id: input.desired.assigned_object_id }, fields: ['assigned_object_type', 'assigned_object_id'] };
    case 'device-lifecycle-change': return { path: `api/dcim/devices/${input.targetId}/`, payload: { status: input.desired.status }, fields: ['status'] };
    case 'interface-intent-update': return { path: `api/dcim/interfaces/${input.targetId}/`, payload: { description: input.desired.description, enabled: input.desired.enabled }, fields: ['description', 'enabled'] };
    case 'rack-placement-update': return { path: `api/dcim/devices/${input.targetId}/`, payload: { rack: input.desired.rack, position: input.desired.position, face: input.desired.face }, fields: ['rack', 'position', 'face'] };
    case 'device-decommission': return { path: `api/dcim/devices/${input.targetId}/`, payload: { status: 'decommissioning' }, fields: ['status'] };
  }
}

function validate(input: InventoryIntent): void {
  if (!input || !inventoryIntentActions.includes(input.action) || !Number.isInteger(input.targetId) || input.targetId < 1 || !exact(input.tenantId) || !exact(input.expectedLastUpdated) || Number.isNaN(Date.parse(input.expectedLastUpdated)) || !plain(input.expected) || !plain(input.desired)) fail();
  const expected = input.expected, desired = input.desired;
  if (input.action === 'ip-address-reassign') {
    if (input.targetKind !== 'netbox-ip-address' || !assignment(expected) || !assignment(desired) || same(expected, desired)) fail();
  } else if (input.action === 'device-lifecycle-change') {
    if (input.targetKind !== 'netbox-device' || !status(expected.status) || !status(desired.status) || expected.status === desired.status || desired.status === 'decommissioning') fail();
  } else if (input.action === 'interface-intent-update') {
    if (input.targetKind !== 'netbox-interface' || !interfaceIntent(expected) || !interfaceIntent(desired) || same(expected, desired)) fail();
  } else if (input.action === 'rack-placement-update') {
    if (input.targetKind !== 'netbox-device' || !placement(expected) || !placement(desired) || same(expected, desired)) fail();
  } else if (input.action === 'device-decommission') {
    if (input.targetKind !== 'netbox-device' || expected.status === 'decommissioning' || Object.keys(desired).length !== 1 || desired.status !== 'decommissioning' || !status(expected.status)) fail();
  }
}
function assignment(value: Record<string, unknown>): boolean { return Object.keys(value).length === 2 && ['dcim.interface', 'virtualization.vminterface'].includes(String(value.assigned_object_type)) && positive(value.assigned_object_id); }
function status(value: unknown): boolean { return ['planned', 'staged', 'active', 'offline', 'failed', 'inventory', 'decommissioning'].includes(String(value)); }
function interfaceIntent(value: Record<string, unknown>): boolean { return Object.keys(value).length === 2 && typeof value.description === 'string' && value.description.length <= 200 && value.description.trim() === value.description && typeof value.enabled === 'boolean'; }
function placement(value: Record<string, unknown>): boolean { return Object.keys(value).length === 3 && positive(value.rack) && Number.isInteger(value.position) && Number(value.position) >= 1 && Number(value.position) <= 60 && ['front', 'rear'].includes(String(value.face)); }
function pick(record: Record<string, unknown>, fields: string[]): Record<string, unknown> { return Object.fromEntries(fields.map(field => [field, scalar(record[field])])); }
function scalar(value: unknown): unknown { if (typeof value === 'object' && value !== null && 'id' in value) return (value as { id: unknown }).id; return value ?? null; }
function numberId(value: unknown): number | null { const id = scalar(value); return positive(id) ? Number(id) : null; }
function nested(record: Record<string, unknown>, key: string, field: string): string | null { const value = record[key]; return value && typeof value === 'object' ? text((value as Record<string, unknown>)[field]) : null; }
function text(value: unknown): string | null { return typeof value === 'string' ? value : null; }
function positive(value: unknown): boolean { return Number.isInteger(value) && Number(value) > 0; }
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function exact(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function fail(): never { throw new NetBoxInventoryIntentError('Approved inventory intent is invalid or outside its bounded action contract.'); }
function statusMessage(status: number): string { if (status === 401) return 'NetBox inventory-write request was not authenticated.'; if (status === 403) return 'NetBox inventory-write request was not authorized.'; if (status === 404) return 'NetBox inventory record was not found.'; if (status === 409) return 'NetBox rejected a conflicting inventory write.'; if (status === 429) return 'NetBox inventory-write request was rate limited.'; if (status >= 500) return 'NetBox service is unavailable.'; return 'NetBox inventory-write request failed.'; }
