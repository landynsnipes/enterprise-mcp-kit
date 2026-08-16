#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpNetBoxClient } from './netbox-client.js';
import { createNetBoxMcpServer } from './mcp-server.js';
import { parseServerConfig } from './server-config.js';

const config = parseServerConfig(process.env);
const server = createNetBoxMcpServer(new HttpNetBoxClient(config));
await server.connect(new StdioServerTransport());
