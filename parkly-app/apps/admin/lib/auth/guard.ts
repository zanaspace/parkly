import type { RoleGrant } from '@parkly/contracts';

export type AppKind = 'portal' | 'admin';

export type AccessDecision =
  | { kind: 'sign-in' }
  | { kind: 'no-access' }
  | { kind: 'mfa-enroll' }
  | { kind: 'mfa-verify' }
  | { kind: 'ok' };

const ADMIN_ROLES = new Set<RoleGrant['role']>([
  'ADMIN_SUPPORT',
  'ADMIN_OPS',
  'ADMIN_FINANCE',
  'ADMIN_COMPLIANCE',
  'SUPER_ADMIN',
]);
const PORTAL_ROLES = new Set<RoleGrant['role']>(['OPERATOR_OWNER', 'OPERATOR_MANAGER']);

/**
 * Who may enter which console, and when MFA must be completed first
 * (FR-AUTH-004, doc 05 §4.2–4.3):
 * - admin: an admin role, and aal2 for everyone;
 * - portal: an operator owner/manager role, and aal2 (attendants use /attend).
 * `nextLevel === 'aal2'` means the user already has a verified factor.
 */
export function decideAccess(input: {
  app: AppKind;
  signedIn: boolean;
  roles: RoleGrant[];
  currentLevel: string | null;
  nextLevel: string | null;
}): AccessDecision {
  if (!input.signedIn) return { kind: 'sign-in' };

  const allowed = input.app === 'admin' ? ADMIN_ROLES : PORTAL_ROLES;
  if (!input.roles.some((r) => allowed.has(r.role))) return { kind: 'no-access' };

  if (input.currentLevel === 'aal2') return { kind: 'ok' };
  return input.nextLevel === 'aal2' ? { kind: 'mfa-verify' } : { kind: 'mfa-enroll' };
}

/** Only same-app relative paths may be used as a post-login redirect. */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  return next;
}
