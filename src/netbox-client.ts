export type DeviceLookup = { name: string } | { id: number };

export interface DeviceContext {
  id: number;
  name: string;
  status: string | null;
  site: string | null;
  role: string | null;
  deviceType: string | null;
  primaryIpv4: string | null;
  primaryIpv6: string | null;
  source: string;
}

export interface NetBoxClient {
  getDeviceContext(lookup: unknown): Promise<DeviceContext>;
}

export class DeviceLookupValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'DeviceLookupValidationError'; }
}

export class NetBoxRequestError extends Error {
  constructor(message: string) { super(message); this.name = 'NetBoxRequestError'; }
}

export class NetBoxClientConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = 'NetBoxClientConfigurationError'; }
}

export function validateDeviceLookup(lookup: unknown): DeviceLookup {
  if (!lookup || typeof lookup !== 'object' || Array.isArray(lookup)) {
    throw new DeviceLookupValidationError('Device lookup must be an object with exactly one of name or id.');
  }
  const value = lookup as Record<string, unknown>;
  const hasName = Object.hasOwn(value, 'name');
  const hasId = Object.hasOwn(value, 'id');
  if (hasName === hasId) {
    throw new DeviceLookupValidationError('Provide exactly one of name or id.');
  }
  if (hasName) {
    if (typeof value.name !== 'string' || !value.name || value.name.trim() !== value.name || /[*?]/.test(value.name)) {
      throw new DeviceLookupValidationError('Device name must be a non-empty exact string without padding or wildcards.');
    }
    return { name: value.name };
  }
  if (!Number.isInteger(value.id) || (value.id as number) < 1) {
    throw new DeviceLookupValidationError('Device ID must be a positive integer.');
  }
  return { id: value.id as number };
}

type Fetch = (input: URL | string, init?: RequestInit) => Promise<Response>;
type NetBoxDevice = Record<string, unknown>;

export interface NetBoxClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetch?: Fetch;
}

export class HttpNetBoxClient implements NetBoxClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetch: Fetch;

  constructor(options: NetBoxClientOptions) {
    const value = options as unknown as Record<string, unknown>;
    if (!options || typeof options !== 'object') throw new NetBoxClientConfigurationError('NetBox client options must be an object.');
    if (typeof value.token !== 'string' || !value.token || value.token.trim() !== value.token) throw new NetBoxClientConfigurationError('NetBox token must be a non-empty, non-padded string.');
    if (typeof value.baseUrl !== 'string' || !value.baseUrl) throw new NetBoxClientConfigurationError('NetBox base URL must be an HTTP or HTTPS URL without credentials.');
    let baseUrl: URL;
    try { baseUrl = new URL(value.baseUrl.endsWith('/') ? value.baseUrl : `${value.baseUrl}/`); } catch { throw new NetBoxClientConfigurationError('NetBox base URL must be an HTTP or HTTPS URL without credentials.'); }
    if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) throw new NetBoxClientConfigurationError('NetBox base URL must be an HTTP or HTTPS URL without credentials.');
    const timeoutMs = value.timeoutMs ?? 5_000;
    if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || (timeoutMs as number) < 1) throw new NetBoxClientConfigurationError('NetBox timeout must be a positive finite integer.');
    if (value.fetch !== undefined && typeof value.fetch !== 'function') throw new NetBoxClientConfigurationError('NetBox fetch must be a function when supplied.');
    this.baseUrl = baseUrl;
    this.token = value.token;
    this.timeoutMs = timeoutMs as number;
    this.fetch = (value.fetch as Fetch | undefined) ?? globalThis.fetch;
  }

  async getDeviceContext(input: unknown): Promise<DeviceContext> {
    const lookup = validateDeviceLookup(input);
    if ('id' in lookup) return this.mapDevice(await this.request(`api/dcim/devices/${lookup.id}/`));
    const payload = await this.request(`api/dcim/devices/?name=${encodeURIComponent(lookup.name)}`) as { results?: unknown };
    const results = Array.isArray(payload.results) ? payload.results : [];
    const exact = results.filter((item): item is NetBoxDevice => Boolean(item) && typeof item === 'object' && (item as NetBoxDevice).name === lookup.name);
    if (exact.length === 0) throw new NetBoxRequestError('NetBox device was not found.');
    if (exact.length > 1) throw new NetBoxRequestError('NetBox device lookup is ambiguous.');
    return this.mapDevice(exact[0]);
  }

  private async request(path: string): Promise<NetBoxDevice> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(new URL(path, this.baseUrl), { method: 'GET', headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new NetBoxRequestError(this.statusMessage(response.status));
      try { return await response.json() as NetBoxDevice; } catch { throw new NetBoxRequestError('NetBox returned invalid JSON.'); }
    } catch (error) {
      if (error instanceof NetBoxRequestError) throw error;
      if ((error as { name?: string }).name === 'AbortError') throw new NetBoxRequestError('NetBox request timed out.');
      throw new NetBoxRequestError('NetBox request failed.');
    } finally { clearTimeout(timer); }
  }

  private statusMessage(status: number): string {
    if (status === 401) return 'NetBox request was not authenticated.';
    if (status === 403) return 'NetBox request was not authorized.';
    if (status === 404) return 'NetBox device was not found.';
    if (status === 429) return 'NetBox request was rate limited.';
    if (status >= 500) return 'NetBox service is unavailable.';
    return 'NetBox request failed.';
  }

  private mapDevice(device: NetBoxDevice): DeviceContext {
    const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
    const nested = (key: string, field: string): string | null => text((device[key] as Record<string, unknown> | null)?.[field]);
    const id = device.id;
    const name = device.name;
    if (!Number.isInteger(id) || typeof name !== 'string') throw new NetBoxRequestError('NetBox returned an invalid device record.');
    return { id: id as number, name, status: nested('status', 'value') ?? nested('status', 'label'), site: nested('site', 'name'), role: nested('role', 'name'), deviceType: nested('device_type', 'model') ?? nested('device_type', 'display'), primaryIpv4: nested('primary_ip4', 'address'), primaryIpv6: nested('primary_ip6', 'address'), source: text(device.url) ?? `api/dcim/devices/${id}/` };
  }
}
