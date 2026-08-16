#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BoundedConfigurationError } from './bounded-http.js';
import { HttpOpnSenseClient } from './opnsense-client.js';
import { createOpnSenseMcpServer } from './opnsense-mcp.js';

function parseConfig(env: NodeJS.ProcessEnv) {
  const baseUrl = env.OPNSENSE_BASE_URL;
  const key = env.OPNSENSE_KEY;
  const secret = env.OPNSENSE_SECRET;
  if (!baseUrl || !key || !secret) throw new BoundedConfigurationError('OPNSENSE_BASE_URL, OPNSENSE_KEY, and OPNSENSE_SECRET are required.');
  const timeoutMs = env.OPNSENSE_TIMEOUT_MS === undefined ? undefined : Number(env.OPNSENSE_TIMEOUT_MS);
  return { baseUrl, key, secret, timeoutMs };
}

const server = createOpnSenseMcpServer(new HttpOpnSenseClient(parseConfig(process.env)), { enableWrites: process.env.OPNSENSE_ENABLE_WRITES === 'true' });
await server.connect(new StdioServerTransport());
