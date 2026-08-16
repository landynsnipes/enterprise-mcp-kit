import { BoundedConfigurationError } from './bounded-http.js';

export function requiredEnv(env: NodeJS.ProcessEnv, names: string[]): Record<string, string> {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new BoundedConfigurationError(`${missing.join(' and ')} are required.`);
  return Object.fromEntries(names.map((name) => [name, env[name] as string]));
}

export function optionalTimeout(env: NodeJS.ProcessEnv, name: string): number | undefined {
  if (env[name] === undefined) return undefined;
  const timeoutMs = Number(env[name]);
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new BoundedConfigurationError(`${name} must be a positive finite integer.`);
  }
  return timeoutMs;
}

export function enableWrites(env: NodeJS.ProcessEnv, name: string): boolean {
  return env[name] === 'true';
}

export function csvList(value: string | undefined, label: string): string[] {
  if (!value) return [];
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (items.some((item) => item !== item.trim() || /[?*]/.test(item))) {
    throw new BoundedConfigurationError(`${label} must be a comma-separated list of exact names.`);
  }
  return [...new Set(items)];
}

export function parsePlaybookMap(value: string | undefined): Record<string, string> {
  if (!value) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { throw new BoundedConfigurationError('ANSIBLE_PLAYBOOKS must be a JSON object of playbookId to absolute path.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BoundedConfigurationError('ANSIBLE_PLAYBOOKS must be a JSON object of playbookId to absolute path.');
  const playbooks: Record<string, string> = {};
  for (const [id, path] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id) || typeof path !== 'string' || !path.startsWith('/') || path.includes('..')) {
      throw new BoundedConfigurationError('ANSIBLE_PLAYBOOKS keys and paths are invalid.');
    }
    playbooks[id] = path;
  }
  return playbooks;
}
