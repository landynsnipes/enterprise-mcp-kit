#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LocalAnsibleExecutor } from './ansible-executor.js';
import { csvList, enableWrites, optionalTimeout, parsePlaybookMap, requiredEnv } from './connector-options.js';
import { HttpKubernetesClient } from './kubernetes-client.js';
import { createKubernetesAnsibleMcpServer } from './kubernetes-ansible-mcp.js';

const env = requiredEnv(process.env, ['KUBERNETES_BASE_URL', 'KUBERNETES_TOKEN']);
const maxReplicas = process.env.KUBERNETES_MAX_REPLICAS === undefined ? 50 : Number(process.env.KUBERNETES_MAX_REPLICAS);
const kubernetes = new HttpKubernetesClient({
  baseUrl: env.KUBERNETES_BASE_URL,
  token: env.KUBERNETES_TOKEN,
  timeoutMs: optionalTimeout(process.env, 'KUBERNETES_TIMEOUT_MS'),
  admittedNamespaces: csvList(process.env.KUBERNETES_ADMITTED_NAMESPACES, 'KUBERNETES_ADMITTED_NAMESPACES'),
  maxReplicas,
});
const ansible = new LocalAnsibleExecutor({
  playbooks: parsePlaybookMap(process.env.ANSIBLE_PLAYBOOKS),
  binary: process.env.ANSIBLE_BINARY,
  inventory: process.env.ANSIBLE_INVENTORY,
  connection: process.env.ANSIBLE_CONNECTION,
});
const server = createKubernetesAnsibleMcpServer(kubernetes, ansible, {
  enableWrites: enableWrites(process.env, 'KUBERNETES_ENABLE_WRITES'),
  maxReplicas,
});
await server.connect(new StdioServerTransport());
