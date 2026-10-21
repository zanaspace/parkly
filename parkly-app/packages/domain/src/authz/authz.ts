/**
 * Authorisation as a pure function (doc 05 §5). Deny by default: an action is
 * allowed only if a rule below grants it to one of the actor's roles AND the
 * resource is inside that role's scope.
 */

export const ROLES = [
  'DRIVER',
  'OPERATOR_OWNER',
  'OPERATOR_MANAGER',
  'OPERATOR_ATTENDANT',
  'ADMIN_SUPPORT',
  'ADMIN_OPS',
  'ADMIN_FINANCE',
  'ADMIN_COMPLIANCE',
  'SUPER_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

export type RoleGrant = { role: Role; operatorId: string | null };

export type Actor = {
  userId: string;
  roles: RoleGrant[];
  /** Attendant lot assignments. */
  lotIds?: string[];
  aal: 'aal1' | 'aal2';
};

export type Resource = { ownerUserId?: string; operatorId?: string; lotId?: string };

type Scope = 'own' | 'operator' | 'lot' | 'platform';
type Rule = { scope: Scope; roles: 'signed-in' | 'any' | readonly Role[] };

/**
 * Every permission the API checks. Add new ones here with their rule.
 * `any` = any role; `signed-in` = also users with no role yet (a new operator
 * signs up by email and has no role until their operator exists).
 */
const RULES = {
  'profile:read:own': { scope: 'own', roles: 'signed-in' },
  'profile:update:own': { scope: 'own', roles: 'any' },
  'consent:write:own': { scope: 'own', roles: 'any' },
  'device:register:own': { scope: 'own', roles: 'any' },
  'session:revoke:own': { scope: 'own', roles: 'signed-in' },
  'operator:create': { scope: 'own', roles: 'signed-in' },
  'vehicle:manage:own': { scope: 'own', roles: ['DRIVER'] },
  'account:delete:own': { scope: 'own', roles: ['DRIVER'] },
  'operator:read': { scope: 'operator', roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER'] },
  'operator:update': { scope: 'operator', roles: ['OPERATOR_OWNER'] },
  'operator:kyb:read': { scope: 'operator', roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER'] },
  'operator:kyb:manage': { scope: 'operator', roles: ['OPERATOR_OWNER'] },
  'bank:list': {
    scope: 'platform',
    roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER', 'ADMIN_OPS', 'ADMIN_FINANCE', 'SUPER_ADMIN'],
  },
  'lot:read': { scope: 'operator', roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER'] },
  'lot:manage': { scope: 'operator', roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER'] },
  'operator:members:read': { scope: 'operator', roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER'] },
  /** Owners invite managers and attendants; managers invite attendants (checked per role in the API). */
  'operator:members:invite': { scope: 'operator', roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER'] },
  'operator:members:remove': { scope: 'operator', roles: ['OPERATOR_OWNER'] },
  'lot:checkin': {
    scope: 'lot',
    roles: ['OPERATOR_OWNER', 'OPERATOR_MANAGER', 'OPERATOR_ATTENDANT'],
  },
  /** Review operator KYB: read details and documents, approve or reject (doc 02 §6.8). */
  'kyb:review': { scope: 'platform', roles: ['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'] },
  /** Lot review queue and detail, photo review, lot status changes (go-live, send back, suspend). */
  'lot:review': { scope: 'platform', roles: ['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'] },
  /** LASPA permit review (doc 03 §4.2). */
  'permit:review': { scope: 'platform', roles: ['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'] },
  /** Price changes and site verification are ops work (doc 02 §6.8). */
  'rate-plan:review': { scope: 'platform', roles: ['ADMIN_OPS', 'SUPER_ADMIN'] },
  'lot:verify': { scope: 'platform', roles: ['ADMIN_OPS', 'SUPER_ADMIN'] },
  'audit:read': { scope: 'platform', roles: ['ADMIN_COMPLIANCE', 'SUPER_ADMIN'] },
  'user:sessions:revoke': { scope: 'platform', roles: ['SUPER_ADMIN'] },
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof RULES;

const AAL2_ROLES: ReadonlySet<Role> = new Set([
  'OPERATOR_OWNER',
  'OPERATOR_MANAGER',
  'ADMIN_SUPPORT',
  'ADMIN_OPS',
  'ADMIN_FINANCE',
  'ADMIN_COMPLIANCE',
  'SUPER_ADMIN',
]);

export function isAdmin(actor: Actor): boolean {
  return actor.roles.some((g) => g.role.startsWith('ADMIN_') || g.role === 'SUPER_ADMIN');
}

/** FR-AUTH-004: admins, operator owners and managers must have completed MFA. */
export function needsAal2(actor: Actor): boolean {
  return actor.roles.some((g) => AAL2_ROLES.has(g.role));
}

function grantCovers(actor: Actor, grant: RoleGrant, scope: Scope, resource: Resource): boolean {
  // An MFA-required role only counts once the session is aal2.
  if (AAL2_ROLES.has(grant.role) && actor.aal !== 'aal2') return false;
  switch (scope) {
    case 'own':
      return resource.ownerUserId === actor.userId;
    case 'platform':
      return true;
    case 'operator':
      return !!resource.operatorId && grant.operatorId === resource.operatorId;
    case 'lot':
      if (!resource.operatorId || grant.operatorId !== resource.operatorId) return false;
      if (grant.role !== 'OPERATOR_ATTENDANT') return true;
      return !!resource.lotId && (actor.lotIds ?? []).includes(resource.lotId);
  }
}

export function can(actor: Actor, action: Action, resource: Resource): boolean {
  const rule: Rule = RULES[action];
  if (rule.scope === 'own') {
    if (resource.ownerUserId !== actor.userId) return false;
    if (rule.roles === 'signed-in') return true;
    if (rule.roles === 'any') return actor.roles.length > 0;
  }
  if (rule.roles === 'signed-in') return false; // only meaningful for own-scope rules
  const allowed = rule.roles === 'any' ? null : new Set<Role>(rule.roles);
  return actor.roles.some(
    (grant) =>
      (allowed === null || allowed.has(grant.role)) &&
      grantCovers(actor, grant, rule.scope, resource),
  );
}
