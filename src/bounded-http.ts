export class BoundedClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoundedClientError';
  }
}

export class BoundedValidationError extends BoundedClientError {
  constructor(message: string) {
    super(message);
    this.name = 'BoundedValidationError';
  }
}

export class BoundedConfigurationError extends BoundedClientError {
  constructor(message: string) {
    super(message);
    this.name = 'BoundedConfigurationError';
  }
}

export type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

export function exactText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value || /[?*]/.test(value)) {
    throw new BoundedValidationError(`${label} must be an exact non-empty string without wildcards.`);
  }
  return value;
}

export function positiveInt(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new BoundedValidationError(`${label} must be a positive integer.`);
  return value as number;
}

export function parseServiceUrl(value: unknown, label: string): URL {
  if (typeof value !== 'string' || !value) throw new BoundedConfigurationError(`${label} must be an HTTP or HTTPS URL without credentials.`);
  let url: URL;
  try { url = new URL(value.endsWith('/') ? value : `${value}/`); } catch { throw new BoundedConfigurationError(`${label} must be an HTTP or HTTPS URL without credentials.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new BoundedConfigurationError(`${label} must be an HTTP or HTTPS URL without credentials.`);
  }
  return url;
}

export function parseTimeout(value: unknown, label: string): number {
  const timeoutMs = value ?? 5_000;
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || (timeoutMs as number) < 1) {
    throw new BoundedConfigurationError(`${label} must be a positive finite integer.`);
  }
  return timeoutMs as number;
}

export function statusMessage(status: number, system: string): string {
  if (status === 401) return `${system} request was not authenticated.`;
  if (status === 403) return `${system} request was not authorized.`;
  if (status === 404) return `${system} record was not found.`;
  if (status === 409) return `${system} rejected a conflicting write.`;
  if (status === 429) return `${system} request was rate limited.`;
  if (status >= 500) return `${system} service is unavailable.`;
  return `${system} request failed.`;
}

export async function jsonRequest(options: {
  baseUrl: URL;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  fetch: FetchLike;
  system: string;
  notFoundMessage?: string;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetch(new URL(options.path, options.baseUrl), {
      method: options.method,
      headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (response.status === 404 && options.notFoundMessage) throw new BoundedClientError(options.notFoundMessage);
    if (!response.ok) throw new BoundedClientError(statusMessage(response.status, options.system));
    try { return await response.json() as unknown; } catch { throw new BoundedClientError(`${options.system} returned invalid JSON.`); }
  } catch (error) {
    if (error instanceof BoundedClientError) throw error;
    if ((error as { name?: string }).name === 'AbortError') throw new BoundedClientError(`${options.system} request timed out.`);
    throw new BoundedClientError(`${options.system} request failed.`);
  } finally {
    clearTimeout(timer);
  }
}

export function asRecord(value: unknown, system: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BoundedClientError(`${system} returned an invalid record.`);
  return value as Record<string, unknown>;
}

export function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function integer(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null;
}
