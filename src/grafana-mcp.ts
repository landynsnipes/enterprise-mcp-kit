import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BoundedClientError } from './bounded-http.js';
import type { GrafanaClient } from './grafana-client.js';

const uidInput = z.object({ uid: z.string().min(1).refine((value) => value.trim() === value && !/[?*]/.test(value), 'uid must be exact.') }).strict();
const dashboardOutput = z.object({ uid: z.string(), title: z.string(), folderTitle: z.string().nullable(), tags: z.array(z.string()).max(20), version: z.number().int().nullable(), url: z.string().nullable(), source: z.string() }).strict();
const alertOutput = z.object({ uid: z.string(), title: z.string(), folderUid: z.string().nullable(), isPaused: z.boolean(), updated: z.string().nullable(), provenance: z.string().nullable(), source: z.string() }).strict();
const pauseInput = z.object({ uid: z.string().min(1), expectedPaused: z.boolean(), paused: z.boolean() }).strict();
const pauseOutput = z.object({ uid: z.string(), title: z.string(), beforePaused: z.boolean(), afterPaused: z.boolean(), updated: z.string().nullable(), source: z.string() }).strict();

function safe(error: unknown): string {
  return error instanceof BoundedClientError ? error.message : 'Grafana lookup failed.';
}

export interface GrafanaMcpOptions { enableWrites?: boolean; }

export function createGrafanaMcpServer(client: GrafanaClient, options: GrafanaMcpOptions = {}): McpServer {
  const server = new McpServer({ name: 'enterprise-mcp-kit-grafana', version: '0.1.0' });
  server.registerTool('get_dashboard_context', { description: 'Read one exact Grafana dashboard. This tool performs no write operations.', inputSchema: uidInput, outputSchema: dashboardOutput }, async (input) => {
    try {
      const result = dashboardOutput.parse(await client.getDashboardContext(input));
      return { content: [{ type: 'text' as const, text: `Grafana dashboard ${result.uid}: ${result.title}; version ${result.version ?? 'unavailable'}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  server.registerTool('get_alert_rule_context', { description: 'Read one exact Grafana alert rule. This tool performs no write operations.', inputSchema: uidInput, outputSchema: alertOutput }, async (input) => {
    try {
      const result = alertOutput.parse(await client.getAlertRuleContext(input));
      return { content: [{ type: 'text' as const, text: `Grafana alert ${result.uid}: ${result.title}; paused=${result.isPaused}.` }], structuredContent: result };
    } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
  });
  if (options.enableWrites) {
    server.registerTool('set_alert_rule_paused', { description: 'Pause or unpause one exact Grafana alert rule after verifying the expected prior paused state.', inputSchema: pauseInput, outputSchema: pauseOutput }, async (input) => {
      try {
        const result = pauseOutput.parse(await client.setAlertRulePaused(input));
        return { content: [{ type: 'text' as const, text: `Grafana alert ${result.uid} paused ${result.beforePaused} -> ${result.afterPaused}.` }], structuredContent: result };
      } catch (error) { return { content: [{ type: 'text' as const, text: safe(error) }], isError: true }; }
    });
  }
  return server;
}
