import { CloudEventValidationError } from './cloud-event-ingestion.js';

export interface CloudEventServiceConfig {
  host: string; port: number; natsServers: string[]; natsUser: string; natsPassword: string;
  oidcIssuer: string; oidcJwksUrl: string; oidcAudience: string; allowedInsecureJwksHosts: string[];
}

export function parseCloudEventServiceConfig(env: NodeJS.ProcessEnv, defaultPort: number): CloudEventServiceConfig {
  const port = Number(env.CLOUD_EVENT_PORT ?? defaultPort);
  const servers = (env.NATS_SERVERS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = (env.CLOUD_EVENT_INSECURE_JWKS_HOSTS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const required = [env.NATS_USER, env.NATS_PASSWORD, env.CLOUD_EVENT_OIDC_ISSUER, env.CLOUD_EVENT_OIDC_JWKS_URL, env.CLOUD_EVENT_OIDC_AUDIENCE];
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || required.some((value) => !exact(value)) || servers.length < 1 || allowed.length > 4) throw new CloudEventValidationError('Cloud event service configuration is invalid or incomplete.');
  return { host: env.CLOUD_EVENT_HOST ?? '0.0.0.0', port, natsServers: servers, natsUser: env.NATS_USER!, natsPassword: env.NATS_PASSWORD!, oidcIssuer: env.CLOUD_EVENT_OIDC_ISSUER!, oidcJwksUrl: env.CLOUD_EVENT_OIDC_JWKS_URL!, oidcAudience: env.CLOUD_EVENT_OIDC_AUDIENCE!, allowedInsecureJwksHosts: allowed };
}
function exact(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value && value.length <= 512; }
