import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BoundedClientError } from './bounded-http.js';
import type { OpnSenseClient } from './opnsense-client.js';

const interfaceInput = z.object({ identity: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'identity must be exact.') }).strict();
const interfaceOutput = z.object({ identity: z.string(), status: z.string().nullable(), ipv4: z.string().nullable(), source: z.string() }).strict();
const aliasInput = z.object({ uuid: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'uuid must be exact.') }).strict();
const aliasOutput = z.object({ uuid: z.string(), name: z.string(), enabled: z.boolean(), type: z.string().nullable(), source: z.string() }).strict();
const toggleInput = z.object({ uuid: z.string().min(1), expectedEnabled: z.boolean() }).strict();
const toggleOutput = z.object({ uuid: z.string(), name: z.string(), beforeEnabled: z.boolean(), afterEnabled: z.boolean(), source: z.string() }).strict();

function safe(error: unknown): string {
  return error instanceof BoundedClientError ? error.message : 'OPNsense lookup failed.';
}

export interface OpnSenseMcpOptions { enableWrites?: boolean; }

export function createOpnSenseMcpServer(client: OpnSenseClient, options: OpnSenseMcpOptions = {}): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit-opnsense', version: '0.1.0' });
  server.registerTool('get_interface_context', { description: 'Read one exact OPNsense interface statistic record. This tool performs no write operations.', inputSchema: interfaceInput, outputSchema: interfaceOutput }, async (input) => {
    try {
      const result = interfaceOutput.parse(await client.getInterfaceContext(input));
      return { content: [{ type: 'text' as const, text: `OPNsense interface ${result.identity}: ${result.status ?? 'unavailable'}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  server.registerTool('get_alias_context', { description: 'Read one exact OPNsense firewall alias. This tool performs no write operations.', inputSchema: aliasInput, outputSchema: aliasOutput }, async (input) => {
    try {
      const result = aliasOutput.parse(await client.getAliasContext(input));
      return { content: [{ type: 'text' as const, text: `OPNsense alias ${result.name}: enabled=${result.enabled}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  if (options.enableWrites) {
    server.registerTool('toggle_alias', { description: 'Toggle one exact OPNsense firewall alias after verifying the expected enabled state.', inputSchema: toggleInput, outputSchema: toggleOutput }, async (input) => {
      try {
        const result = toggleOutput.parse(await client.toggleAlias(input));
        return { content: [{ type: 'text' as const, text: `OPNsense alias ${result.name} enabled ${result.beforeEnabled} -> ${result.afterEnabled}.` }], structuredContent: result };
      } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
    });
  }
  return server;
}
