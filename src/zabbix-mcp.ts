import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BoundedClientError } from './bounded-http.js';
import type { ZabbixClient } from './zabbix-client.js';

const hostInput = z.object({ host: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'host must be exact.') }).strict();
const hostOutput = z.object({ hostId: z.string(), host: z.string(), name: z.string(), status: z.string(), inventoryOs: z.string().nullable(), source: z.string() }).strict();
const problemInput = z.object({ eventId: z.number().int().positive() }).strict();
const problemOutput = z.object({ eventId: z.string(), name: z.string(), severity: z.string().nullable(), acknowledged: z.boolean(), clock: z.string().nullable(), host: z.string().nullable(), source: z.string() }).strict();
const ackInput = z.object({ eventId: z.number().int().positive(), message: z.string().min(1).max(500), expectedAcknowledged: z.literal(false) }).strict();
const ackOutput = z.object({ eventId: z.string(), beforeAcknowledged: z.boolean(), afterAcknowledged: z.boolean(), message: z.string(), source: z.string() }).strict();

function safe(error: unknown): string {
  return error instanceof BoundedClientError ? error.message : 'Zabbix lookup failed.';
}

export interface ZabbixMcpOptions { enableWrites?: boolean; }

export function createZabbixMcpServer(client: ZabbixClient, options: ZabbixMcpOptions = {}): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit-zabbix', version: '0.1.0' });
  server.registerTool('get_host_context', { description: 'Read one exact Zabbix host. This tool performs no write operations.', inputSchema: hostInput, outputSchema: hostOutput }, async (input) => {
    try {
      const result = hostOutput.parse(await client.getHostContext(input));
      return { content: [{ type: 'text' as const, text: `Zabbix host ${result.host}: ${result.status}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  server.registerTool('get_problem_context', { description: 'Read one exact Zabbix problem. This tool performs no write operations.', inputSchema: problemInput, outputSchema: problemOutput }, async (input) => {
    try {
      const result = problemOutput.parse(await client.getProblemContext(input));
      return { content: [{ type: 'text' as const, text: `Zabbix problem ${result.eventId}: ${result.name}; acknowledged=${result.acknowledged}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  if (options.enableWrites) {
    server.registerTool('acknowledge_problem', { description: 'Acknowledge one exact unacknowledged Zabbix problem with a bounded operator message.', inputSchema: ackInput, outputSchema: ackOutput }, async (input) => {
      try {
        const result = ackOutput.parse(await client.acknowledgeProblem(input));
        return { content: [{ type: 'text' as const, text: `Zabbix problem ${result.eventId} acknowledged.` }], structuredContent: result };
      } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
    });
  }
  return server;
}
