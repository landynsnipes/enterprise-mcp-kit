import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BoundedClientError } from './bounded-http.js';
import type { WireGuardClient } from './wireguard-client.js';

export interface WireGuardMcpOptions { enableWrites?: boolean; includeObserverHealth?: boolean; }

const interfaceInput = z.object({ interface: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'interface must be exact.') }).strict();
const interfaceOutput = z.object({
  interface: z.string(),
  listenPort: z.number().int().nullable(),
  peerCount: z.number().int(),
  peers: z.array(z.object({
    publicKeyFingerprint: z.string(),
    endpoint: z.string().nullable(),
    allowedIps: z.array(z.string()).max(32),
    latestHandshakeSeconds: z.number().nullable(),
    transferRx: z.number().nullable(),
    transferTx: z.number().nullable(),
  }).strict()).max(64),
  source: z.string(),
}).strict();
const healthOutput = z.object({
  healthy: z.boolean(),
  allowedPathUp: z.boolean().nullable(),
  deniedPathBlocked: z.boolean().nullable(),
  decisionTraceId: z.string().nullable(),
  routers: z.array(z.object({
    site: z.string(),
    interfaceUp: z.boolean(),
    handshakeAgeSeconds: z.number().int().nullable(),
    receivedBytes: z.number().int().nullable(),
    sentBytes: z.number().int().nullable(),
  }).strict()).max(8),
  source: z.string(),
}).strict();
const restartOutput = z.object({ interface: z.string(), changed: z.boolean(), source: z.string() }).strict();

function safe(error: unknown): string {
  return error instanceof BoundedClientError ? error.message : 'WireGuard lookup failed.';
}

export function createWireGuardMcpServer(client: WireGuardClient, options: WireGuardMcpOptions = {}): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit-wireguard', version: '0.1.0' });
  server.registerTool('get_interface_status', { description: 'Read one exact WireGuard interface without private keys. This tool performs no write operations.', inputSchema: interfaceInput, outputSchema: interfaceOutput }, async (input) => {
    try {
      const result = interfaceOutput.parse(await client.getInterfaceStatus(input));
      return { content: [{ type: 'text' as const, text: `WireGuard ${result.interface}: ${result.peerCount} peers; listenPort ${result.listenPort ?? 'unavailable'}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  if (options.includeObserverHealth && client.getTunnelHealth) {
    server.registerTool('get_tunnel_health', { description: 'Read a bounded WireGuard observer health document. This tool performs no write operations.', inputSchema: z.object({}).strict(), outputSchema: healthOutput }, async (input) => {
      try {
        const result = healthOutput.parse(await client.getTunnelHealth?.(input));
        return { content: [{ type: 'text' as const, text: `WireGuard observer healthy=${result.healthy}.` }], structuredContent: result };
      } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
    });
  }
  if (options.enableWrites) {
    server.registerTool('restart_interface', { description: 'Restart one admitted WireGuard interface unit after verifying it exists.', inputSchema: interfaceInput, outputSchema: restartOutput }, async (input) => {
      try {
        const result = restartOutput.parse(await client.restartInterface(input));
        return { content: [{ type: 'text' as const, text: `WireGuard ${result.interface} restart changed=${result.changed}.` }], structuredContent: result };
      } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
    });
  }
  return server;
}
