import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DeviceLookupValidationError, NetBoxClientConfigurationError, NetBoxRequestError, type NetBoxClient } from './netbox-client.js';

export const getDeviceContextInputSchema = z.object({ name: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'Device name must be exact.').optional(), id: z.number().int().positive().optional() }).strict().superRefine((value, context) => {
  if ((value.name === undefined) === (value.id === undefined)) context.addIssue({ code: 'custom', message: 'Provide exactly one of name or id.' });
});
export const deviceContextOutputSchema = z.object({ id: z.number().int().positive(), name: z.string(), status: z.string().nullable(), site: z.string().nullable(), role: z.string().nullable(), deviceType: z.string().nullable(), primaryIpv4: z.string().nullable(), primaryIpv6: z.string().nullable(), source: z.string() }).strict();

export function createNetBoxMcpServer(client: NetBoxClient): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit', version: '0.1.0' });
  server.registerTool('get_device_context', { description: 'Read one exact NetBox device context. This tool performs no write operations.', inputSchema: getDeviceContextInputSchema, outputSchema: deviceContextOutputSchema }, async (input) => {
    try {
      const device = await client.getDeviceContext(input);
      const result = deviceContextOutputSchema.parse(device);
      const optional = (label: string, value: string | null) => `${label}: ${value ?? 'unavailable'}`;
      return { content: [{ type: 'text', text: `Device ${result.name} (ID ${result.id}); ${optional('status', result.status)}; ${optional('site', result.site)}; source: ${result.source}` }], structuredContent: { ...result } };
    } catch (error) {
      const message = error instanceof DeviceLookupValidationError || error instanceof NetBoxClientConfigurationError || error instanceof NetBoxRequestError ? error.message : 'NetBox lookup failed.';
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  });
  return server;
}
