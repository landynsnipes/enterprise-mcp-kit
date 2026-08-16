#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BoundedConfigurationError } from './bounded-http.js';
import { HttpGrafanaClient } from './grafana-client.js';
import { createGrafanaMcpServer } from './grafana-mcp.js';

function parseConfig(env: NodeJS.ProcessEnv) {
  const baseUrl = env.GRAFANA_BASE_URL;
  const token = env.GRAFANA_TOKEN;
  if (!baseUrl || !token) throw new BoundedConfigurationError('GRAFANA_BASE_URL and GRAFANA_TOKEN are required.');
  const timeoutMs = env.GRAFANA_TIMEOUT_MS === undefined ? undefined : Number(env.GRAFANA_TIMEOUT_MS);
  return { baseUrl, token, timeoutMs };
}

const server = createGrafanaMcpServer(new HttpGrafanaClient(parseConfig(process.env)), { enableWrites: process.env.GRAFANA_ENABLE_WRITES === 'true' });
await server.connect(new StdioServerTransport());
