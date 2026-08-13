import type { IncomingMessage, ServerResponse } from 'node:http';

export async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 65_536) throw new Error('request-too-large'); chunks.push(buffer); }
  const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
  const url = `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`;
  return new Request(url, { method: request.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
}

export async function writeWebResponse(response: ServerResponse, web: Response): Promise<void> {
  response.statusCode = web.status; web.headers.forEach((value, name) => response.setHeader(name, value)); response.end(Buffer.from(await web.arrayBuffer()));
}

export function logEvent(level: 'info' | 'warning' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level, service: process.env.CLOUD_EVENT_SERVICE_NAME ?? 'cloud-event-service', environment: 'local-evaluation', event, ...fields }));
}
