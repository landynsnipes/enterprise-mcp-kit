#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BoundedConfigurationError } from './bounded-http.js';
import { HttpZabbixClient } from './zabbix-client.js';
import { createZabbixMcpServer } from './zabbix-mcp.js';

function parseConfig(env: NodeJS.ProcessEnv) {
  const baseUrl = env.ZABBIX_BASE_URL;
  const token = env.ZABBIX_TOKEN;
  if (!baseUrl || !token) throw new BoundedConfigurationError('ZABBIX_BASE_URL and ZABBIX_TOKEN are required.');
  const timeoutMs = env.ZABBIX_TIMEOUT_MS === undefined ? undefined : Number(env.ZABBIX_TIMEOUT_MS);
  return { baseUrl, token, timeoutMs };
}

const server = createZabbixMcpServer(new HttpZabbixClient(parseConfig(process.env)), { enableWrites: process.env.ZABBIX_ENABLE_WRITES === 'true' });
await server.connect(new StdioServerTransport());
