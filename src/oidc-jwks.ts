import { createPublicKey, verify } from 'node:crypto';
import { GovernanceAuthorizationError, GovernanceValidationError } from './governance.js';
import type { VerifiedOidcClaims } from './governance-identity.js';

type Fetch = (input: URL | string, init?: RequestInit) => Promise<Response>;
export interface OidcJwksVerifierOptions { issuer: string; audience: string; jwksUrl: string; allowInsecureLoopback?: boolean; allowedInsecureJwksHosts?: string[]; fetch?: Fetch; now?: () => Date; clockSkewSeconds?: number; maxTokenAgeSeconds?: number; }
type Header = { alg?: unknown; kid?: unknown; typ?: unknown };
type Jwk = { kty?: unknown; kid?: unknown; n?: unknown; e?: unknown; use?: unknown };

/** Verifies RS256 access tokens against an issuer JWKS; unsigned and symmetric tokens are rejected. */
export class OidcJwksVerifier {
  private readonly fetch: Fetch; private readonly now: () => Date;
  constructor(private readonly options: OidcJwksVerifierOptions) { if ((!isHttps(options.issuer) && !(options.allowInsecureLoopback && isLoopbackHttp(options.issuer))) || (!isHttps(options.jwksUrl) && !(options.allowInsecureLoopback && (isLoopbackHttp(options.jwksUrl) || isAllowedLabHttp(options.jwksUrl, options.allowedInsecureJwksHosts)))) || !isText(options.audience)) throw new GovernanceValidationError('OIDC issuer and JWKS URL must use HTTPS unless an exact lab host is explicitly allowed.'); this.fetch = options.fetch ?? globalThis.fetch; this.now = options.now ?? (() => new Date()); }
  async verify(token: string): Promise<VerifiedOidcClaims> {
    if (!isText(token) || token.length > 8192) throw new GovernanceAuthorizationError('Bearer token is invalid.'); const parts = token.split('.'); if (parts.length !== 3) throw new GovernanceAuthorizationError('Bearer token is invalid.');
    const header = decode<Header>(parts[0]); const claims = decode<VerifiedOidcClaims & { exp?: unknown; nbf?: unknown }>(parts[1]);
    if (header.alg !== 'RS256' || !isText(header.kid) || !['JWT', 'at+jwt'].includes(String(header.typ))) throw new GovernanceAuthorizationError('Bearer token uses an unsupported signing algorithm or type.');
    const response = await this.fetch(this.options.jwksUrl, { headers: { Accept: 'application/json' } }); if (!response.ok) throw new GovernanceAuthorizationError('OIDC signing keys are unavailable.');
    const payload = await response.json() as { keys?: unknown }; const jwk = Array.isArray(payload.keys) ? payload.keys.find((key): key is Jwk => Boolean(key) && typeof key === 'object' && (key as Jwk).kid === header.kid) : undefined;
    if (!jwk || jwk.kty !== 'RSA' || !isText(jwk.n) || !isText(jwk.e) || (jwk.use !== undefined && jwk.use !== 'sig')) throw new GovernanceAuthorizationError('Bearer token signing key is not trusted.');
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`); const signature = Buffer.from(parts[2], 'base64url'); if (!verify('RSA-SHA256', signed, createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' }), signature)) throw new GovernanceAuthorizationError('Bearer token signature is invalid.');
    const now = Math.floor(this.now().getTime() / 1000); const skew = this.options.clockSkewSeconds ?? 60; const maxAge = this.options.maxTokenAgeSeconds ?? 600;
    if (!Number.isInteger(claims.exp) || (claims.exp as number) <= now - skew || (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || (claims.nbf as number) > now + skew)) || !Number.isInteger(claims.iat) || (claims.iat as number) > now + skew || (claims.iat as number) < now - maxAge - skew || claims.iss !== this.options.issuer || !audiences(claims.aud).includes(this.options.audience) || claims.azp !== this.options.audience || !isText(claims.jti)) throw new GovernanceAuthorizationError('Bearer token claims are invalid.');
    return { iss: claims.iss, aud: claims.aud, azp: claims.azp, sub: claims.sub, tenant_id: claims.tenant_id, roles: claims.roles, iat: claims.iat, jti: claims.jti };
  }
}
function decode<T>(part: string): T { try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T; } catch { throw new GovernanceAuthorizationError('Bearer token is invalid.'); } }
function audiences(value: unknown): string[] { return Array.isArray(value) ? value.filter(isText) : isText(value) ? [value] : []; }
function isText(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function isHttps(value: unknown): boolean { try { return isText(value) && new URL(value).protocol === 'https:'; } catch { return false; } }
function isLoopbackHttp(value: unknown): boolean { try { const url = new URL(String(value)); return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname); } catch { return false; } }
function isAllowedLabHttp(value: unknown, allowed: string[] | undefined): boolean { try { const url = new URL(String(value)); return url.protocol === 'http:' && Array.isArray(allowed) && allowed.length <= 4 && allowed.includes(url.hostname) && allowed.every((host) => /^[a-z0-9][a-z0-9.-]{0,62}$/.test(host)); } catch { return false; } }
