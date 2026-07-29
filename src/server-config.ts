import { NetBoxClientConfigurationError, type NetBoxClientOptions } from './netbox-client.js';

export function parseServerConfig(env: NodeJS.ProcessEnv): NetBoxClientOptions {
  const baseUrl = env.NETBOX_BASE_URL;
  const token = env.NETBOX_TOKEN;
  if (!baseUrl || !token) throw new NetBoxClientConfigurationError('NETBOX_BASE_URL and NETBOX_TOKEN are required.');
  const timeoutMs = env.NETBOX_TIMEOUT_MS === undefined ? undefined : Number(env.NETBOX_TIMEOUT_MS);
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs < 1)) throw new NetBoxClientConfigurationError('NETBOX_TIMEOUT_MS must be a positive finite integer.');
  return { baseUrl, token, timeoutMs };
}
