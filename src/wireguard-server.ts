#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BoundedConfigurationError } from './bounded-http.js';
import { csvList, enableWrites, optionalTimeout } from './connector-options.js';
import { HttpWireGuardClient, LocalWireGuardClient } from './wireguard-client.js';
import { createWireGuardMcpServer } from './wireguard-mcp.js';

const backend = process.env.WIREGUARD_BACKEND ?? 'http';
const admittedInterfaces = csvList(process.env.WIREGUARD_ADMITTED_INTERFACES, 'WIREGUARD_ADMITTED_INTERFACES');
const enableWrite = enableWrites(process.env, 'WIREGUARD_ENABLE_WRITES');
const timeoutMs = optionalTimeout(process.env, 'WIREGUARD_TIMEOUT_MS');

let client;
if (backend === 'local') {
  client = new LocalWireGuardClient({ admittedInterfaces });
} else if (backend === 'http') {
  const baseUrl = process.env.WIREGUARD_BASE_URL ?? process.env.WIREGUARD_OBSERVER_BASE_URL;
  if (!baseUrl) throw new BoundedConfigurationError('WIREGUARD_BASE_URL is required for the HTTP WireGuard backend.');
  client = new HttpWireGuardClient({
    baseUrl,
    timeoutMs,
    admittedInterfaces,
  });
} else {
  throw new BoundedConfigurationError('WIREGUARD_BACKEND must be http or local.');
}

const server = createWireGuardMcpServer(client, {
  enableWrites: enableWrite,
  includeObserverHealth: backend === 'http',
});
await server.connect(new StdioServerTransport());
