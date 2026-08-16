import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AnsibleExecutor } from './ansible-executor.js';
import { BoundedClientError } from './bounded-http.js';
import type { KubernetesClient } from './kubernetes-client.js';

export interface KubernetesAnsibleMcpOptions { enableWrites?: boolean; maxReplicas?: number; }

const exactName = z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'must be exact.');
const workloadInput = z.object({ namespace: exactName, name: exactName }).strict();
const workloadOutput = z.object({ namespace: z.string(), name: z.string(), kind: z.literal('Deployment'), replicas: z.number().int().nullable(), readyReplicas: z.number().int().nullable(), resourceVersion: z.string(), source: z.string() }).strict();
const scaleOutput = z.object({ namespace: z.string(), name: z.string(), beforeReplicas: z.number().int(), afterReplicas: z.number().int(), resourceVersion: z.string(), source: z.string() }).strict();
const playbookInput = z.object({ playbookId: exactName, mode: z.enum(['check', 'apply']) }).strict();
const playbookOutput = z.object({ playbookId: z.string(), mode: z.enum(['check', 'apply']), changed: z.boolean(), source: z.string() }).strict();

function safe(error: unknown): string {
  return error instanceof BoundedClientError ? error.message : 'Kubernetes or Ansible lookup failed.';
}

export function createKubernetesAnsibleMcpServer(kubernetes: KubernetesClient, ansible: AnsibleExecutor, options: KubernetesAnsibleMcpOptions = {}): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit-kubernetes-ansible', version: '0.1.0' });
  const maxReplicas = options.maxReplicas ?? 50;
  const scaleInput = z.object({ namespace: exactName, name: exactName, expectedReplicas: z.number().int().positive(), replicas: z.number().int().positive().max(maxReplicas), expectedResourceVersion: z.string().min(1) }).strict();
  server.registerTool('get_workload_context', { description: 'Read one exact Kubernetes Deployment. This tool performs no write operations.', inputSchema: workloadInput, outputSchema: workloadOutput }, async (input) => {
    try {
      const result = workloadOutput.parse(await kubernetes.getWorkloadContext(input));
      return { content: [{ type: 'text' as const, text: `Deployment ${result.namespace}/${result.name}: replicas ${result.replicas ?? 'unavailable'}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  if (options.enableWrites) {
    server.registerTool('set_workload_replicas', { description: 'Scale one exact Kubernetes Deployment after verifying replica count and resourceVersion.', inputSchema: scaleInput, outputSchema: scaleOutput }, async (input) => {
      try {
        const result = scaleOutput.parse(await kubernetes.setWorkloadReplicas(input));
        return { content: [{ type: 'text' as const, text: `Deployment ${result.namespace}/${result.name} replicas ${result.beforeReplicas} -> ${result.afterReplicas}.` }], structuredContent: result };
      } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
    });
    server.registerTool('run_admitted_playbook', { description: 'Run one operator-admitted Ansible playbook in check or apply mode. Generic playbooks are rejected.', inputSchema: playbookInput, outputSchema: playbookOutput }, async (input) => {
      try {
        const result = playbookOutput.parse(await ansible.runAdmittedPlaybook(input));
        return { content: [{ type: 'text' as const, text: `Ansible ${result.playbookId} ${result.mode}: changed=${result.changed}.` }], structuredContent: result };
      } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
    });
  }
  return server;
}
