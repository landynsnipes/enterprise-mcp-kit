export type DeviceLookup = { name: string } | { id: number };
export type SiteLookup = { name: string } | { id: number };
export interface ConnectivityLookup { fromSite: string; toSite: string; }
export type RackLookup = { id: number } | { site: string; name: string };
export type PowerPathLookup = DeviceLookup;

export interface DeviceContext {
  id: number;
  name: string;
  status: string | null;
  site: string | null;
  role: string | null;
  deviceType: string | null;
  platform: string | null;
  observedSoftwareVersion: string | null;
  minimumApprovedVersion: string | null;
  versionCompliance: string | null;
  versionEvidenceSource: string | null;
  versionObservedAt: string | null;
  primaryIpv4: string | null;
  primaryIpv6: string | null;
  source: string;
}

export interface SiteDeviceSummary {
  name: string;
  status: string | null;
  role: string | null;
  platform: string | null;
  observedSoftwareVersion: string | null;
  minimumApprovedVersion: string | null;
  versionCompliance: string | null;
}

export interface SiteOverview {
  id: number;
  name: string;
  status: string | null;
  region: string | null;
  tenant: string | null;
  facility: string | null;
  deviceCount: number;
  rackCount: number;
  activeCircuitCount: number;
  contactAssignmentCount: number;
  softwareCompliantCount: number;
  softwareNonCompliantCount: number;
  softwareUnknownCount: number;
  devices: SiteDeviceSummary[];
  truncated: boolean;
  source: string;
}
export interface ConnectivityEndpoint {
  site: string;
  device: string | null;
  interface: string | null;
  address: string | null;
}
export interface ConnectivitySegment {
  kind: 'circuit' | 'vpn';
  id: number;
  name: string;
  status: string | null;
  description: string | null;
  endpoints: ConnectivityEndpoint[];
  source: string;
}
export interface ConnectivityPath {
  fromSite: string;
  toSite: string;
  segments: ConnectivitySegment[];
  completeness: 'direct-evidence' | 'partial-evidence' | 'no-direct-evidence';
  unknowns: string[];
  truncated: boolean;
  source: string;
}
export interface RackDeviceSummary {
  name: string;
  status: string | null;
  role: string | null;
  deviceType: string | null;
  position: number | null;
  face: string | null;
  platform: string | null;
  primaryIpv4: string | null;
  observedSoftwareVersion: string | null;
  versionCompliance: string | null;
}
export interface RackContext {
  id: number;
  name: string;
  status: string | null;
  site: string;
  location: string | null;
  tenant: string | null;
  facilityId: string | null;
  role: string | null;
  widthInches: number | null;
  heightUnits: number;
  deviceCount: number;
  powerFeedCount: number;
  description: string | null;
  devices: RackDeviceSummary[];
  truncated: boolean;
  source: string;
}
export interface PowerPathConnection { pduDevice: string; outlet: string; feedLeg: string | null; upstreamPowerFeed?: RecordedPowerFeed | null; source: string; }
export interface PowerPathPort { name: string; maximumDrawWatts: number | null; allocatedDrawWatts: number | null; connection: PowerPathConnection | null; }
export interface RecordedPowerFeed { id: number; name: string; status: string | null; type: string | null; source: string; }
export interface PowerPath {
  device: { id: number; name: string; site: string | null; rack: string | null };
  powerPorts: PowerPathPort[]; recordedRackPowerFeeds: RecordedPowerFeed[];
  redundancy: 'a-b-evidenced' | 'single-path' | 'incomplete-evidence' | 'no-power-port-evidence';
  unknowns: string[]; truncated: boolean; source: string;
}

export interface NetBoxClient {
  getDeviceContext(lookup: unknown): Promise<DeviceContext>;
  getSiteOverview(lookup: unknown): Promise<SiteOverview>;
  getConnectivityPath(lookup: unknown): Promise<ConnectivityPath>;
  getRackContext(lookup: unknown): Promise<RackContext>;
  getPowerPath(lookup: unknown): Promise<PowerPath>;
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

export function validateSiteLookup(lookup: unknown): SiteLookup {
  if (!lookup || typeof lookup !== 'object' || Array.isArray(lookup)) {
    throw new DeviceLookupValidationError('Site lookup must be an object with exactly one of name or id.');
  }
  const value = lookup as Record<string, unknown>;
  const hasName = Object.hasOwn(value, 'name');
  const hasId = Object.hasOwn(value, 'id');
  if (hasName === hasId) throw new DeviceLookupValidationError('Provide exactly one of name or id.');
  if (hasName) {
    if (typeof value.name !== 'string' || !value.name || value.name.trim() !== value.name || /[*?]/.test(value.name)) {
      throw new DeviceLookupValidationError('Site name must be a non-empty exact string without padding or wildcards.');
    }
    return { name: value.name };
  }
  if (!Number.isInteger(value.id) || (value.id as number) < 1) {
    throw new DeviceLookupValidationError('Site ID must be a positive integer.');
  }
  return { id: value.id as number };
}

export function validateConnectivityLookup(input: unknown): ConnectivityLookup {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DeviceLookupValidationError('Connectivity lookup must contain exact fromSite and toSite names.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'fromSite,toSite') throw new DeviceLookupValidationError('Connectivity lookup must contain exactly fromSite and toSite.');
  for (const key of ['fromSite', 'toSite'] as const) {
    const name = value[key];
    if (typeof name !== 'string' || !name || name.trim() !== name || /[*?]/.test(name)) throw new DeviceLookupValidationError(`${key} must be a non-empty exact string without padding or wildcards.`);
  }
  if (value.fromSite === value.toSite) throw new DeviceLookupValidationError('fromSite and toSite must be different.');
  return { fromSite: value.fromSite as string, toSite: value.toSite as string };
}

export function validateRackLookup(input: unknown): RackLookup {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DeviceLookupValidationError('Rack lookup must contain id or exact site and name.');
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if (keys === 'id') {
    if (!Number.isInteger(value.id) || (value.id as number) < 1) throw new DeviceLookupValidationError('Rack ID must be a positive integer.');
    return { id: value.id as number };
  }
  if (keys !== 'name,site') throw new DeviceLookupValidationError('Rack lookup must contain exactly id or site and name.');
  for (const key of ['site', 'name'] as const) {
    const text = value[key];
    if (typeof text !== 'string' || !text || text.trim() !== text || /[*?]/.test(text)) throw new DeviceLookupValidationError(`Rack ${key} must be a non-empty exact string without padding or wildcards.`);
  }
  return { site: value.site as string, name: value.name as string };
}
export function validatePowerPathLookup(input: unknown): PowerPathLookup { return validateDeviceLookup(input); }

type Fetch = (input: URL | string, init?: RequestInit) => Promise<Response>;
type NetBoxDevice = Record<string, unknown>;
type NetBoxRecord = Record<string, unknown>;
type NetBoxList = { count?: unknown; results?: unknown };

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
    if ('id' in lookup) return this.mapDevice(await this.request(`api/dcim/devices/${lookup.id}/`, 'NetBox device was not found.'));
    const payload = await this.request(`api/dcim/devices/?name=${encodeURIComponent(lookup.name)}`) as { results?: unknown };
    const results = Array.isArray(payload.results) ? payload.results : [];
    const exact = results.filter((item): item is NetBoxDevice => Boolean(item) && typeof item === 'object' && (item as NetBoxDevice).name === lookup.name);
    if (exact.length === 0) throw new NetBoxRequestError('NetBox device was not found.');
    if (exact.length > 1) throw new NetBoxRequestError('NetBox device lookup is ambiguous.');
    return this.mapDevice(exact[0]);
  }

  async getSiteOverview(input: unknown): Promise<SiteOverview> {
    const lookup = validateSiteLookup(input);
    let site: NetBoxRecord;
    if ('id' in lookup) {
      site = await this.request(`api/dcim/sites/${lookup.id}/`, 'NetBox site was not found.');
    } else {
      const payload = await this.request(`api/dcim/sites/?name=${encodeURIComponent(lookup.name)}`) as NetBoxList;
      const results = Array.isArray(payload.results) ? payload.results : [];
      const exact = results.filter((item): item is NetBoxRecord => Boolean(item) && typeof item === 'object' && (item as NetBoxRecord).name === lookup.name);
      if (exact.length === 0) throw new NetBoxRequestError('NetBox site was not found.');
      if (exact.length > 1) throw new NetBoxRequestError('NetBox site lookup is ambiguous.');
      site = exact[0];
    }
    const siteId = site.id;
    const siteName = site.name;
    if (!Number.isInteger(siteId) || typeof siteName !== 'string') throw new NetBoxRequestError('NetBox returned an invalid site record.');

    const [devicePayload, rackPayload, circuitPayload, contactPayload] = await Promise.all([
      this.request(`api/dcim/devices/?site_id=${siteId}&limit=100`),
      this.request(`api/dcim/racks/?site_id=${siteId}&limit=100`),
      this.request(`api/circuits/circuits/?site_id=${siteId}&status=active&limit=100`),
      this.request(`api/tenancy/contact-assignments/?object_type=dcim.site&object_id=${siteId}&limit=100`),
    ]) as NetBoxList[];
    const deviceRecords = Array.isArray(devicePayload.results)
      ? devicePayload.results.filter((item): item is NetBoxDevice => Boolean(item) && typeof item === 'object')
      : [];
    const mappedDevices = deviceRecords.map((device) => this.mapDevice(device));
    const count = (payload: NetBoxList): number => Number.isInteger(payload.count) ? payload.count as number : 0;
    const status = (device: DeviceContext): string | null => device.versionCompliance;
    return {
      id: siteId as number,
      name: siteName,
      status: this.nestedText(site, 'status', 'value') ?? this.nestedText(site, 'status', 'label'),
      region: this.nestedText(site, 'region', 'name'),
      tenant: this.nestedText(site, 'tenant', 'name'),
      facility: this.text(site.facility),
      deviceCount: count(devicePayload),
      rackCount: count(rackPayload),
      activeCircuitCount: count(circuitPayload),
      contactAssignmentCount: count(contactPayload),
      softwareCompliantCount: mappedDevices.filter((device) => status(device) === 'meets-example-policy').length,
      softwareNonCompliantCount: mappedDevices.filter((device) => status(device) !== null && status(device) !== 'meets-example-policy').length,
      softwareUnknownCount: mappedDevices.filter((device) => status(device) === null).length,
      devices: mappedDevices.map((device) => ({
        name: device.name,
        status: device.status,
        role: device.role,
        platform: device.platform,
        observedSoftwareVersion: device.observedSoftwareVersion,
        minimumApprovedVersion: device.minimumApprovedVersion,
        versionCompliance: device.versionCompliance,
      })),
      truncated: count(devicePayload) > deviceRecords.length || count(rackPayload) > 100 || count(circuitPayload) > 100 || count(contactPayload) > 100,
      source: this.text(site.url) ?? `api/dcim/sites/${siteId}/`,
    };
  }

  async getConnectivityPath(input: unknown): Promise<ConnectivityPath> {
    const lookup = validateConnectivityLookup(input);
    const [from, to] = await Promise.all([this.resolveSite({ name: lookup.fromSite }), this.resolveSite({ name: lookup.toSite })]);
    const [fromDevices, toDevices, circuitTerms, tunnels, tunnelTerms] = await Promise.all([
      this.request(`api/dcim/devices/?site_id=${from.id}&limit=100`),
      this.request(`api/dcim/devices/?site_id=${to.id}&limit=100`),
      this.request('api/circuits/circuit-terminations/?limit=100'),
      this.request('api/vpn/tunnels/?limit=100'),
      this.request('api/vpn/tunnel-terminations/?limit=100'),
    ]) as NetBoxList[];
    const results = (payload: NetBoxList): NetBoxRecord[] => Array.isArray(payload.results) ? payload.results.filter((item): item is NetBoxRecord => Boolean(item) && typeof item === 'object') : [];
    const ids = (payload: NetBoxList): Set<number> => new Set(results(payload).map((item) => item.id).filter((id): id is number => Number.isInteger(id)));
    const fromDeviceIds = ids(fromDevices);
    const toDeviceIds = ids(toDevices);
    const endpoint = (record: NetBoxRecord): ConnectivityEndpoint | null => {
      const termination = record.termination as NetBoxRecord | undefined;
      const device = termination?.device as NetBoxRecord | undefined;
      const deviceId = device?.id;
      const directSiteId = termination?.id;
      const site = fromDeviceIds.has(deviceId as number) || (record.termination_type === 'dcim.site' && directSiteId === from.id)
        ? lookup.fromSite
        : toDeviceIds.has(deviceId as number) || (record.termination_type === 'dcim.site' && directSiteId === to.id)
          ? lookup.toSite : null;
      if (!site) return null;
      return { site, device: this.text(device?.name), interface: record.termination_type === 'dcim.interface' ? this.text(termination?.name) : null, address: this.nestedText(record, 'outside_ip', 'address') };
    };
    const group = (records: NetBoxRecord[], key: 'circuit' | 'tunnel'): Map<number, NetBoxRecord[]> => {
      const grouped = new Map<number, NetBoxRecord[]>();
      for (const record of records) {
        const id = (record[key] as NetBoxRecord | undefined)?.id;
        if (!Number.isInteger(id)) continue;
        grouped.set(id as number, [...(grouped.get(id as number) ?? []), record]);
      }
      return grouped;
    };
    const segments: ConnectivitySegment[] = [];
    for (const [id, records] of group(results(circuitTerms), 'circuit')) {
      const endpoints = records.map(endpoint).filter((item): item is ConnectivityEndpoint => item !== null);
      if (!endpoints.some((item) => item.site === lookup.fromSite) || !endpoints.some((item) => item.site === lookup.toSite)) continue;
      const brief = records[0].circuit as NetBoxRecord;
      segments.push({ kind: 'circuit', id, name: this.text(brief.cid) ?? this.text(brief.display) ?? `circuit-${id}`, status: this.nestedText(brief, 'status', 'value'), description: this.text(brief.description), endpoints, source: this.text(brief.url) ?? `api/circuits/circuits/${id}/` });
    }
    const tunnelById = new Map(results(tunnels).map((item) => [item.id as number, item]));
    for (const [id, records] of group(results(tunnelTerms), 'tunnel')) {
      const endpoints = records.map(endpoint).filter((item): item is ConnectivityEndpoint => item !== null);
      if (!endpoints.some((item) => item.site === lookup.fromSite) || !endpoints.some((item) => item.site === lookup.toSite)) continue;
      const detail = tunnelById.get(id) ?? records[0].tunnel as NetBoxRecord;
      segments.push({ kind: 'vpn', id, name: this.text(detail.name) ?? this.text(detail.display) ?? `tunnel-${id}`, status: this.nestedText(detail, 'status', 'value'), description: this.text(detail.description), endpoints, source: this.text(detail.url) ?? `api/vpn/tunnels/${id}/` });
    }
    const hasCircuit = segments.some((item) => item.kind === 'circuit');
    const hasVpn = segments.some((item) => item.kind === 'vpn');
    const unknowns = ['NetBox evidence does not prove the runtime routed or forwarding path.'];
    if (!hasCircuit) unknowns.push('No direct circuit evidence was found between the selected sites.');
    if (!hasVpn) unknowns.push('No direct VPN evidence was found between the selected sites.');
    const count = (payload: NetBoxList) => Number.isInteger(payload.count) ? payload.count as number : 0;
    return {
      fromSite: lookup.fromSite, toSite: lookup.toSite, segments,
      completeness: hasCircuit && hasVpn ? 'direct-evidence' : segments.length ? 'partial-evidence' : 'no-direct-evidence',
      unknowns,
      truncated: [fromDevices, toDevices, circuitTerms, tunnels, tunnelTerms].some((payload) => count(payload) > results(payload).length),
      source: `NetBox read-only evidence for sites ${from.id} and ${to.id}`,
    };
  }

  async getRackContext(input: unknown): Promise<RackContext> {
    const lookup = validateRackLookup(input);
    let rack: NetBoxRecord;
    if ('id' in lookup) {
      rack = await this.request(`api/dcim/racks/${lookup.id}/`, 'NetBox rack was not found.');
    } else {
      const site = await this.resolveSite({ name: lookup.site });
      const payload = await this.request(`api/dcim/racks/?site_id=${site.id}&name=${encodeURIComponent(lookup.name)}`) as NetBoxList;
      const exact = Array.isArray(payload.results) ? payload.results.filter((item): item is NetBoxRecord => Boolean(item) && typeof item === 'object' && (item as NetBoxRecord).name === lookup.name) : [];
      if (exact.length === 0) throw new NetBoxRequestError('NetBox rack was not found.');
      if (exact.length > 1) throw new NetBoxRequestError('NetBox rack lookup is ambiguous.');
      rack = exact[0];
    }
    const rackId = rack.id;
    const rackName = rack.name;
    const siteName = this.nestedText(rack, 'site', 'name');
    if (!Number.isInteger(rackId) || typeof rackName !== 'string' || !siteName) throw new NetBoxRequestError('NetBox returned an invalid rack record.');
    const payload = await this.request(`api/dcim/devices/?rack_id=${rackId}&limit=100`) as NetBoxList;
    const records = Array.isArray(payload.results) ? payload.results.filter((item): item is NetBoxDevice => Boolean(item) && typeof item === 'object') : [];
    const count = Number.isInteger(payload.count) ? payload.count as number : records.length;
    const devices = records.map((device) => {
      const mapped = this.mapDevice(device);
      return {
        name: mapped.name,
        status: mapped.status,
        role: mapped.role,
        deviceType: mapped.deviceType,
        position: typeof device.position === 'number' ? device.position : null,
        face: this.nestedText(device, 'face', 'value'),
        platform: mapped.platform,
        primaryIpv4: mapped.primaryIpv4,
        observedSoftwareVersion: mapped.observedSoftwareVersion,
        versionCompliance: mapped.versionCompliance,
      };
    }).sort((a, b) => (b.position ?? -1) - (a.position ?? -1) || a.name.localeCompare(b.name));
    return {
      id: rackId as number,
      name: rackName,
      status: this.nestedText(rack, 'status', 'value'),
      site: siteName,
      location: this.nestedText(rack, 'location', 'name'),
      tenant: this.nestedText(rack, 'tenant', 'name'),
      facilityId: this.text(rack.facility_id),
      role: this.nestedText(rack, 'role', 'name'),
      widthInches: typeof (rack.width as NetBoxRecord | undefined)?.value === 'number' ? (rack.width as NetBoxRecord).value as number : null,
      heightUnits: Number.isInteger(rack.u_height) ? rack.u_height as number : 0,
      deviceCount: Number.isInteger(rack.device_count) ? rack.device_count as number : count,
      powerFeedCount: Number.isInteger(rack.powerfeed_count) ? rack.powerfeed_count as number : 0,
      description: this.text(rack.description),
      devices,
      truncated: count > records.length,
      source: this.text(rack.url) ?? `api/dcim/racks/${rackId}/`,
    };
  }

  async getPowerPath(input: unknown): Promise<PowerPath> {
    const lookup = validatePowerPathLookup(input);
    const device = await this.getDeviceRecord(lookup);
    const deviceId = device.id; const deviceName = this.text(device.name);
    if (!Number.isInteger(deviceId) || !deviceName) throw new NetBoxRequestError('NetBox returned an invalid device record.');
    const rackId = this.nestedNumber(device, 'rack', 'id');
    const [portsPayload, feedsPayload] = await Promise.all([
      this.request(`api/dcim/power-ports/?device_id=${deviceId}&limit=100`),
      rackId === null ? Promise.resolve({ count: 0, results: [] } as NetBoxList) : this.request(`api/dcim/power-feeds/?rack_id=${rackId}&limit=100`),
    ]) as NetBoxList[];
    const portRecords = records(portsPayload); const count = (payload: NetBoxList) => Number.isInteger(payload.count) ? payload.count as number : records(payload).length;
    const feeds = records(feedsPayload).filter((feed) => Number.isInteger(feed.id)).map((feed) => ({ id: feed.id as number, name: this.text(feed.name) ?? `power-feed-${feed.id}`, status: this.nestedText(feed, 'status', 'value'), type: this.nestedText(feed, 'type', 'value'), source: this.text(feed.url) ?? `api/dcim/power-feeds/${feed.id}/` }));
    const feedById = new Map(feeds.map((feed) => [feed.id, feed]));
    const connections = portRecords.map((port) => { const endpoint = this.connectedEndpoint(port); const pdu = endpoint?.device as NetBoxRecord | undefined; return { port, pduId: Number.isInteger(pdu?.id) ? pdu?.id as number : null, outletId: Number.isInteger(endpoint?.id) ? endpoint?.id as number : null }; });
    const allPduIds = [...new Set(connections.map((item) => item.pduId).filter((id): id is number => id !== null))]; const pduIds = allPduIds.slice(0, 16);
    const pduData = await Promise.all(pduIds.map(async (pduId) => { const [outlets, inputs] = await Promise.all([this.request(`api/dcim/power-outlets/?device_id=${pduId}&limit=100`), this.request(`api/dcim/power-ports/?device_id=${pduId}&limit=100`)]); return { pduId, outlets: outlets as NetBoxList, inputs: inputs as NetBoxList }; }));
    const outletById = new Map<number, NetBoxRecord>(); const inputById = new Map<number, NetBoxRecord>(); for (const data of pduData) { for (const outlet of records(data.outlets)) if (Number.isInteger(outlet.id)) outletById.set(outlet.id as number, outlet); for (const input of records(data.inputs)) if (Number.isInteger(input.id)) inputById.set(input.id as number, input); }
    const powerPorts = connections.map(({ port, pduId, outletId }) => { const endpoint = this.connectedEndpoint(port); const pdu = endpoint?.device as NetBoxRecord | undefined; const outlet = outletId === null ? undefined : outletById.get(outletId); const inputId = this.nestedNumber(outlet ?? {}, 'power_port', 'id'); const feedEndpoint = inputId === null ? undefined : this.connectedEndpoint(inputById.get(inputId) ?? {}); const feedId = Number.isInteger(feedEndpoint?.id) ? feedEndpoint?.id as number : null; const feed = feedId === null ? null : feedById.get(feedId) ?? null; return { name: this.text(port.name) ?? `power-port-${port.id}`, maximumDrawWatts: typeof port.maximum_draw === 'number' ? port.maximum_draw : null, allocatedDrawWatts: typeof port.allocated_draw === 'number' ? port.allocated_draw : null, connection: pduId === null || outletId === null || !pdu ? null : { pduDevice: this.text(pdu.name) ?? this.text(pdu.display) ?? `device-${pduId}`, outlet: this.text(outlet?.name) ?? this.text(endpoint?.name) ?? `outlet-${outletId}`, feedLeg: this.nestedText(outlet ?? {}, 'feed_leg', 'value') ?? this.text(outlet?.feed_leg), upstreamPowerFeed: feed, source: this.text(port.url) ?? `api/dcim/power-ports/${port.id}/` } }; });
    const connected = powerPorts.filter((port) => port.connection !== null); const legs = new Set(connected.map((port) => port.connection?.feedLeg).filter((leg): leg is string => leg !== null)); const pdus = new Set(connected.map((port) => port.connection?.pduDevice));
    const redundancy = powerPorts.length === 0 ? 'no-power-port-evidence' : connected.length === 1 ? 'single-path' : legs.has('A') && legs.has('B') && pdus.size >= 2 ? 'a-b-evidenced' : 'incomplete-evidence';
    const unknowns = ['NetBox inventory evidence does not prove live electrical state, load, breaker state, or power delivery.']; if (powerPorts.length === 0) unknowns.push('No recorded power ports were found for this device.'); else if (connected.length !== powerPorts.length) unknowns.push('One or more recorded device power ports do not have a cabled PDU outlet endpoint.'); if (connected.some((port) => port.connection?.upstreamPowerFeed === null)) unknowns.push('One or more PDU outlets could not be traced through a recorded PDU input cable to a rack power feed.'); if (rackId === null) unknowns.push('The device has no recorded rack, so rack power feeds cannot be evaluated.'); if (allPduIds.length > pduIds.length) unknowns.push('PDU traversal was bounded to 16 upstream devices.');
    return { device: { id: deviceId as number, name: deviceName, site: this.nestedText(device, 'site', 'name'), rack: this.nestedText(device, 'rack', 'name') }, powerPorts, recordedRackPowerFeeds: feeds, redundancy, unknowns, truncated: count(portsPayload) > portRecords.length || count(feedsPayload) > feeds.length || pduData.some((data) => count(data.outlets) > records(data.outlets).length || count(data.inputs) > records(data.inputs).length), source: this.text(device.url) ?? `api/dcim/devices/${deviceId}/` };
  }

  private async resolveSite(lookup: SiteLookup): Promise<NetBoxRecord> {
    if ('id' in lookup) return this.request(`api/dcim/sites/${lookup.id}/`, 'NetBox site was not found.');
    const payload = await this.request(`api/dcim/sites/?name=${encodeURIComponent(lookup.name)}`) as NetBoxList;
    const exact = Array.isArray(payload.results) ? payload.results.filter((item): item is NetBoxRecord => Boolean(item) && typeof item === 'object' && (item as NetBoxRecord).name === lookup.name) : [];
    if (exact.length === 0) throw new NetBoxRequestError('NetBox site was not found.');
    if (exact.length > 1) throw new NetBoxRequestError('NetBox site lookup is ambiguous.');
    return exact[0];
  }

  private async getDeviceRecord(lookup: DeviceLookup): Promise<NetBoxRecord> {
    if ('id' in lookup) return this.request(`api/dcim/devices/${lookup.id}/`, 'NetBox device was not found.');
    const payload = await this.request(`api/dcim/devices/?name=${encodeURIComponent(lookup.name)}`) as NetBoxList; const exact = records(payload).filter((item) => item.name === lookup.name);
    if (exact.length === 0) throw new NetBoxRequestError('NetBox device was not found.'); if (exact.length > 1) throw new NetBoxRequestError('NetBox device lookup is ambiguous.'); return exact[0];
  }

  private async request(path: string, notFoundMessage = 'NetBox record was not found.'): Promise<NetBoxRecord> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(new URL(path, this.baseUrl), { method: 'GET', headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new NetBoxRequestError(this.statusMessage(response.status, notFoundMessage));
      try { return await response.json() as NetBoxDevice; } catch { throw new NetBoxRequestError('NetBox returned invalid JSON.'); }
    } catch (error) {
      if (error instanceof NetBoxRequestError) throw error;
      if ((error as { name?: string }).name === 'AbortError') throw new NetBoxRequestError('NetBox request timed out.');
      throw new NetBoxRequestError('NetBox request failed.');
    } finally { clearTimeout(timer); }
  }

  private statusMessage(status: number, notFoundMessage: string): string {
    if (status === 401) return 'NetBox request was not authenticated.';
    if (status === 403) return 'NetBox request was not authorized.';
    if (status === 404) return notFoundMessage;
    if (status === 429) return 'NetBox request was rate limited.';
    if (status >= 500) return 'NetBox service is unavailable.';
    return 'NetBox request failed.';
  }

  private mapDevice(device: NetBoxDevice): DeviceContext {
    const customFields = device.custom_fields && typeof device.custom_fields === 'object'
      ? device.custom_fields as Record<string, unknown>
      : {};
    const customText = (key: string): string | null => this.text(customFields[key]);
    const id = device.id;
    const name = device.name;
    if (!Number.isInteger(id) || typeof name !== 'string') throw new NetBoxRequestError('NetBox returned an invalid device record.');
    return {
      id: id as number,
      name,
      status: this.nestedText(device, 'status', 'value') ?? this.nestedText(device, 'status', 'label'),
      site: this.nestedText(device, 'site', 'name'),
      role: this.nestedText(device, 'role', 'name'),
      deviceType: this.nestedText(device, 'device_type', 'model') ?? this.nestedText(device, 'device_type', 'display'),
      platform: this.nestedText(device, 'platform', 'name'),
      observedSoftwareVersion: customText('observed_software_version'),
      minimumApprovedVersion: customText('minimum_approved_version'),
      versionCompliance: customText('version_compliance'),
      versionEvidenceSource: customText('version_evidence_source'),
      versionObservedAt: customText('version_observed_at'),
      primaryIpv4: this.nestedText(device, 'primary_ip4', 'address'),
      primaryIpv6: this.nestedText(device, 'primary_ip6', 'address'),
      source: this.text(device.url) ?? `api/dcim/devices/${id}/`,
    };
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private nestedText(record: NetBoxRecord, key: string, field: string): string | null {
    return this.text((record[key] as Record<string, unknown> | null)?.[field]);
  }
  private nestedNumber(record: NetBoxRecord, key: string, field: string): number | null { const value = (record[key] as Record<string, unknown> | null)?.[field]; return Number.isInteger(value) ? value as number : null; }
  private connectedEndpoint(record: NetBoxRecord): NetBoxRecord | undefined { const plural = record.connected_endpoints ?? record.link_peers; if (Array.isArray(plural)) return plural.find((item): item is NetBoxRecord => Boolean(item) && typeof item === 'object'); const singular = record.connected_endpoint; return singular && typeof singular === 'object' ? singular as NetBoxRecord : undefined; }
}

function records(payload: NetBoxList): NetBoxRecord[] { return Array.isArray(payload.results) ? payload.results.filter((item): item is NetBoxRecord => Boolean(item) && typeof item === 'object') : []; }
