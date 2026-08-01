import { GovernanceAuthorizationError, GovernanceValidationError, type GovernanceActor } from './governance.js';
import { admittedGovernanceRoles, capabilitiesForRoles } from './governance-capabilities.js';

export interface VerifiedOidcClaims { iss: string; aud: string | string[]; azp: string; sub: string; tenant_id: string; roles: string[]; iat: number; jti: string; }
export interface OidcActorResolverOptions { issuer: string; audience: string; }

/**
 * Converts claims only after an upstream OIDC/JWT verifier has validated the
 * token signature, expiry, and issuer transport. Raw bearer tokens are never
 * accepted here.
 */
export function resolveVerifiedOidcActor(claims: VerifiedOidcClaims, options: OidcActorResolverOptions): GovernanceActor {
  if (!claims || claims.iss !== options.issuer || !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(options.audience)) throw new GovernanceAuthorizationError('Verified OIDC claims do not match the configured issuer and audience.');
  if (!isExactText(claims.sub) || !isExactText(claims.tenant_id) || !Array.isArray(claims.roles) || !claims.roles.every(isExactText)) throw new GovernanceValidationError('Verified OIDC claims are missing required subject, tenant, or roles.');
  const roles = [...new Set(claims.roles.filter((role) => admittedGovernanceRoles.includes(role)))];
  if (capabilitiesForRoles(roles).length === 0) throw new GovernanceAuthorizationError('Actor has no admitted governance role.');
  return { subjectId: claims.sub, tenantId: claims.tenant_id, roles };
}
function isExactText(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
