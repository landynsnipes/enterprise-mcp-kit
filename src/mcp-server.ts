import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DeviceLookupValidationError, NetBoxClientConfigurationError, NetBoxRequestError, type NetBoxClient } from './netbox-client.js';

export const getDeviceContextInputSchema = z.object({ name: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'Device name must be exact.').optional(), id: z.number().int().positive().optional() }).strict().superRefine((value, context) => {
  if ((value.name === undefined) === (value.id === undefined)) context.addIssue({ code: 'custom', message: 'Provide exactly one of name or id.' });
});
export const deviceContextOutputSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: z.string().nullable(),
  site: z.string().nullable(),
  role: z.string().nullable(),
  deviceType: z.string().nullable(),
  platform: z.string().nullable(),
  observedSoftwareVersion: z.string().nullable(),
  minimumApprovedVersion: z.string().nullable(),
  versionCompliance: z.string().nullable(),
  versionEvidenceSource: z.string().nullable(),
  versionObservedAt: z.string().nullable(),
  primaryIpv4: z.string().nullable(),
  primaryIpv6: z.string().nullable(),
  source: z.string(),
}).strict();
export const getSiteOverviewInputSchema = z.object({
  name: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'Site name must be exact.').optional(),
  id: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  if ((value.name === undefined) === (value.id === undefined)) context.addIssue({ code: 'custom', message: 'Provide exactly one of name or id.' });
});
const siteDeviceSummarySchema = z.object({
  name: z.string(),
  status: z.string().nullable(),
  role: z.string().nullable(),
  platform: z.string().nullable(),
  observedSoftwareVersion: z.string().nullable(),
  minimumApprovedVersion: z.string().nullable(),
  versionCompliance: z.string().nullable(),
}).strict();
export const siteOverviewOutputSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: z.string().nullable(),
  region: z.string().nullable(),
  tenant: z.string().nullable(),
  facility: z.string().nullable(),
  deviceCount: z.number().int().nonnegative(),
  rackCount: z.number().int().nonnegative(),
  activeCircuitCount: z.number().int().nonnegative(),
  contactAssignmentCount: z.number().int().nonnegative(),
  softwareCompliantCount: z.number().int().nonnegative(),
  softwareNonCompliantCount: z.number().int().nonnegative(),
  softwareUnknownCount: z.number().int().nonnegative(),
  devices: z.array(siteDeviceSummarySchema).max(100),
  truncated: z.boolean(),
  source: z.string(),
}).strict();
export const getConnectivityPathInputSchema = z.object({
  fromSite: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'fromSite must be exact.'),
  toSite: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'toSite must be exact.'),
}).strict().refine((value) => value.fromSite !== value.toSite, 'fromSite and toSite must be different.');
const connectivityEndpointSchema = z.object({ site: z.string(), device: z.string().nullable(), interface: z.string().nullable(), address: z.string().nullable() }).strict();
const connectivitySegmentSchema = z.object({
  kind: z.enum(['circuit', 'vpn']), id: z.number().int().positive(), name: z.string(),
  status: z.string().nullable(), description: z.string().nullable(),
  endpoints: z.array(connectivityEndpointSchema).max(100), source: z.string(),
}).strict();
export const connectivityPathOutputSchema = z.object({
  fromSite: z.string(), toSite: z.string(), segments: z.array(connectivitySegmentSchema).max(200),
  completeness: z.enum(['direct-evidence', 'partial-evidence', 'no-direct-evidence']),
  unknowns: z.array(z.string()).max(10), truncated: z.boolean(), source: z.string(),
}).strict();
export const getRackContextInputSchema = z.union([
  z.object({ id: z.number().int().positive() }).strict(),
  z.object({
    site: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'Rack site must be exact.'),
    name: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'Rack name must be exact.'),
  }).strict(),
]);
const rackDeviceSummarySchema = z.object({
  name: z.string(), status: z.string().nullable(), role: z.string().nullable(),
  deviceType: z.string().nullable(), position: z.number().nullable(), face: z.string().nullable(),
  platform: z.string().nullable(), primaryIpv4: z.string().nullable(),
  observedSoftwareVersion: z.string().nullable(), versionCompliance: z.string().nullable(),
}).strict();
export const rackContextOutputSchema = z.object({
  id: z.number().int().positive(), name: z.string(), status: z.string().nullable(),
  site: z.string(), location: z.string().nullable(), tenant: z.string().nullable(),
  facilityId: z.string().nullable(), role: z.string().nullable(),
  widthInches: z.number().nullable(), heightUnits: z.number().int().nonnegative(),
  deviceCount: z.number().int().nonnegative(), powerFeedCount: z.number().int().nonnegative(),
  description: z.string().nullable(), devices: z.array(rackDeviceSummarySchema).max(100),
  truncated: z.boolean(), source: z.string(),
}).strict();
export const getPowerPathInputSchema = getDeviceContextInputSchema;
const powerPathConnectionSchema = z.object({ pduDevice: z.string(), outlet: z.string(), feedLeg: z.string().nullable(), upstreamPowerFeed: z.object({ id: z.number().int().positive(), name: z.string(), status: z.string().nullable(), type: z.string().nullable(), source: z.string() }).strict().nullable().optional(), source: z.string() }).strict();
const powerPathPortSchema = z.object({ name: z.string(), maximumDrawWatts: z.number().nullable(), allocatedDrawWatts: z.number().nullable(), connection: powerPathConnectionSchema.nullable() }).strict();
const recordedPowerFeedSchema = z.object({ id: z.number().int().positive(), name: z.string(), status: z.string().nullable(), type: z.string().nullable(), source: z.string() }).strict();
export const powerPathOutputSchema = z.object({
  device: z.object({ id: z.number().int().positive(), name: z.string(), site: z.string().nullable(), rack: z.string().nullable() }).strict(),
  powerPorts: z.array(powerPathPortSchema).max(100), recordedRackPowerFeeds: z.array(recordedPowerFeedSchema).max(100),
  redundancy: z.enum(['a-b-evidenced', 'single-path', 'incomplete-evidence', 'no-power-port-evidence']), unknowns: z.array(z.string()).max(10), truncated: z.boolean(), source: z.string(),
}).strict();

function safeError(error: unknown): string {
  return error instanceof DeviceLookupValidationError || error instanceof NetBoxClientConfigurationError || error instanceof NetBoxRequestError
    ? error.message
    : 'NetBox lookup failed.';
}

export function createNetBoxMcpServer(client: NetBoxClient): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit', version: '0.1.0' });
  server.registerTool('get_device_context', { description: 'Read one exact NetBox device context. This tool performs no write operations.', inputSchema: getDeviceContextInputSchema, outputSchema: deviceContextOutputSchema }, async (input) => {
    try {
      const device = await client.getDeviceContext(input);
      const result = deviceContextOutputSchema.parse(device);
      const optional = (label: string, value: string | null) => `${label}: ${value ?? 'unavailable'}`;
      return {
        content: [{
          type: 'text',
          text: `Device ${result.name} (ID ${result.id}); ${optional('status', result.status)}; ${optional('site', result.site)}; ${optional('platform', result.platform)}; ${optional('observed software', result.observedSoftwareVersion)}; ${optional('minimum approved', result.minimumApprovedVersion)}; ${optional('compliance', result.versionCompliance)}; ${optional('evidence source', result.versionEvidenceSource)}; ${optional('observed at', result.versionObservedAt)}; source: ${result.source}`,
        }],
        structuredContent: { ...result },
      };
    } catch (error) {
      return { content: [{ type: 'text', text: safeError(error) }], isError: true };
    }
  });
  server.registerTool('get_site_overview', {
    description: 'Read one exact NetBox site and a bounded summary of its devices, racks, active circuits, contacts, and software compliance. This tool performs no write operations.',
    inputSchema: getSiteOverviewInputSchema,
    outputSchema: siteOverviewOutputSchema,
  }, async (input) => {
    try {
      const overview = siteOverviewOutputSchema.parse(await client.getSiteOverview(input));
      const text = `Site ${overview.name} (ID ${overview.id}); devices: ${overview.deviceCount}; racks: ${overview.rackCount}; active circuits: ${overview.activeCircuitCount}; contact assignments: ${overview.contactAssignmentCount}; software compliant: ${overview.softwareCompliantCount}; software non-compliant: ${overview.softwareNonCompliantCount}; software unknown: ${overview.softwareUnknownCount}; truncated: ${overview.truncated}; source: ${overview.source}`;
      return { content: [{ type: 'text', text }], structuredContent: { ...overview } };
    } catch (error) {
      return { content: [{ type: 'text', text: safeError(error) }], isError: true };
    }
  });
  server.registerTool('get_connectivity_path', {
    description: 'Read bounded NetBox circuit and VPN evidence directly connecting two exact sites. It does not claim a runtime routed path and performs no write operations.',
    inputSchema: getConnectivityPathInputSchema,
    outputSchema: connectivityPathOutputSchema,
  }, async (input) => {
    try {
      const path = connectivityPathOutputSchema.parse(await client.getConnectivityPath(input));
      const summary = path.segments.map((segment) => `${segment.kind}: ${segment.name}`).join('; ') || 'no direct segments';
      return {
        content: [{ type: 'text', text: `${path.fromSite} to ${path.toSite}; ${summary}; completeness: ${path.completeness}; unknowns: ${path.unknowns.join(' ')}` }],
        structuredContent: { ...path },
      };
    } catch (error) {
      return { content: [{ type: 'text', text: safeError(error) }], isError: true };
    }
  });
  server.registerTool('get_rack_context', {
    description: 'Read one exact NetBox rack by ID or exact site and rack name, including a bounded device elevation summary and recorded power-feed count. This tool performs no write operations.',
    inputSchema: getRackContextInputSchema,
    outputSchema: rackContextOutputSchema,
  }, async (input) => {
    try {
      const rack = rackContextOutputSchema.parse(await client.getRackContext(input));
      const positioned = rack.devices.filter((device) => device.position !== null).length;
      const text = `Rack ${rack.name} (ID ${rack.id}) at ${rack.site}; devices: ${rack.deviceCount}; positioned devices: ${positioned}; power feeds: ${rack.powerFeedCount}; height: ${rack.heightUnits}U; truncated: ${rack.truncated}; source: ${rack.source}`;
      return { content: [{ type: 'text', text }], structuredContent: { ...rack } };
    } catch (error) {
      return { content: [{ type: 'text', text: safeError(error) }], isError: true };
    }
  });
  server.registerTool('get_power_path', {
    description: 'Read bounded NetBox inventory evidence for what powers one exact device: its power ports, cabled PDU outlets, and recorded rack power feeds. It never claims live electrical state and performs no write operations.',
    inputSchema: getPowerPathInputSchema, outputSchema: powerPathOutputSchema,
  }, async (input) => {
    try {
      const path = powerPathOutputSchema.parse(await client.getPowerPath(input));
      const connected = path.powerPorts.filter((port) => port.connection !== null).length;
      const text = `Power path for ${path.device.name} (ID ${path.device.id}); recorded power ports: ${path.powerPorts.length}; cabled PDU outlets: ${connected}; recorded rack power feeds: ${path.recordedRackPowerFeeds.length}; redundancy: ${path.redundancy}; NetBox inventory evidence does not prove live electrical state, load, breaker state, or power delivery.`;
      return { content: [{ type: 'text', text }], structuredContent: { ...path } };
    } catch (error) { return { content: [{ type: 'text', text: safeError(error) }], isError: true }; }
  });
  return server;
}
