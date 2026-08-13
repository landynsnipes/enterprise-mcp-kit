import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCloudEventServiceConfig } from '../src/cloud-event-service-config.js';
import { OidcJwksVerifier } from '../src/oidc-jwks.js';

const env = { NATS_SERVERS: 'nats://nats:4222', NATS_USER: 'cloud_events', NATS_PASSWORD: 'secret-value', CLOUD_EVENT_OIDC_ISSUER: 'http://127.0.0.1:8081/realms/enterprise-mcp-kit', CLOUD_EVENT_OIDC_JWKS_URL: 'http://host.docker.internal:8081/realms/enterprise-mcp-kit/protocol/openid-connect/certs', CLOUD_EVENT_OIDC_AUDIENCE: 'enterprise-mcp-kit', CLOUD_EVENT_INSECURE_JWKS_HOSTS: 'host.docker.internal' };

test('parses explicit secret-bearing local service configuration without returning defaults for credentials', () => {
  const config = parseCloudEventServiceConfig(env, 8790);
  assert.equal(config.port, 8790); assert.deepEqual(config.natsServers, ['nats://nats:4222']); assert.deepEqual(config.allowedInsecureJwksHosts, ['host.docker.internal']);
});

test('allows only an exact explicitly named insecure lab JWKS host', () => {
  assert.doesNotThrow(() => new OidcJwksVerifier({ issuer: env.CLOUD_EVENT_OIDC_ISSUER, audience: env.CLOUD_EVENT_OIDC_AUDIENCE, jwksUrl: env.CLOUD_EVENT_OIDC_JWKS_URL, allowInsecureLoopback: true, allowedInsecureJwksHosts: ['host.docker.internal'] }));
  assert.throws(() => new OidcJwksVerifier({ issuer: env.CLOUD_EVENT_OIDC_ISSUER, audience: env.CLOUD_EVENT_OIDC_AUDIENCE, jwksUrl: 'http://keycloak.attacker.invalid/certs', allowInsecureLoopback: true, allowedInsecureJwksHosts: ['host.docker.internal'] }));
});

test('fails closed when required broker or identity configuration is absent', () => {
  assert.throws(() => parseCloudEventServiceConfig({ ...env, NATS_PASSWORD: '' }, 8790));
  assert.throws(() => parseCloudEventServiceConfig({ ...env, CLOUD_EVENT_INSECURE_JWKS_HOSTS: 'a,b,c,d,e' }, 8790));
});
