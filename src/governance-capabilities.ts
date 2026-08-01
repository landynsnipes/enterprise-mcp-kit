import { GovernanceAuthorizationError, GovernanceValidationError, type GovernanceActor } from './governance.js';

export type GovernanceCapability = 'plan:create' | 'plan:read' | 'plan:approve' | 'plan:reject' | 'audit:read';
const roleCapabilities: Readonly<Record<string, readonly GovernanceCapability[]>> = Object.freeze({
  planner: ['plan:create', 'plan:read'],
  approver: ['plan:read', 'plan:approve', 'plan:reject', 'audit:read'],
  auditor: ['plan:read', 'audit:read'],
});

export function capabilitiesForRoles(roles: readonly string[]): GovernanceCapability[] {
  if (!Array.isArray(roles) || !roles.every(isExactText)) throw new GovernanceValidationError('OIDC roles must be exact strings.');
  return [...new Set(roles.flatMap((role) => roleCapabilities[role] ?? []))];
}
export function requireCapability(actor: GovernanceActor, capability: GovernanceCapability): void {
  if (!isExactText(actor?.subjectId) || !isExactText(actor?.tenantId)) throw new GovernanceValidationError('Actor identity and tenant must be exact strings.');
  if (!capabilitiesForRoles(actor.roles).includes(capability)) throw new GovernanceAuthorizationError(`Actor lacks required ${capability} capability.`);
}
export const admittedGovernanceRoles = Object.freeze(Object.keys(roleCapabilities));
function isExactText(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
