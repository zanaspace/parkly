import { can, needsAal2, type Action, type Actor, type Resource } from '@parkly/domain/authz';
import type { Context, MiddlewareHandler } from 'hono';
import type { RequestIdVariables } from 'hono/request-id';
import { ApiError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { Store, UserRow } from '../store/types.js';
import type { Identity, TokenVerifier } from './token.js';

export type AuthEnv = {
  Variables: RequestIdVariables & {
    identity: Identity;
    accessToken: string;
    user: UserRow;
    actor: Actor;
  };
};

/** Verifies the bearer token (or ?token= query param). Sets `identity`; does not need a users row yet (bootstrap). */
export function authenticate(verify: TokenVerifier): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    const authToken =
      scheme?.toLowerCase() === 'bearer' && token ? token : (c.req.query('token') ?? null);
    if (!authToken) throw new ApiError('AUTH_REQUIRED');
    try {
      c.set('identity', await verify(authToken));
    } catch {
      throw new ApiError('AUTH_REQUIRED');
    }
    c.set('accessToken', authToken);
    await next();
  };
}

const BLOCKED = new Set(['LOCKED', 'SUSPENDED', 'DELETED']);

/**
 * Loads the profile and re-reads roles from the database on every request:
 * token claims are only a hint, so role changes take effect immediately
 * (doc 05 §4.4).
 */
export function loadActor(store: Store): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const identity = c.get('identity');
    const user = await store.users.find(identity.userId);
    if (!user) throw new ApiError('AUTH_REQUIRED', 'Call /v1/auth/bootstrap first');
    if (BLOCKED.has(user.status)) throw new ApiError('AUTH_ACCOUNT_LOCKED');
    c.set('user', user);
    const roles = await store.users.roles(user.id);
    c.set('actor', {
      userId: user.id,
      roles,
      // Attendants work only their assigned lots (FR-OPS-004).
      lotIds: roles.some((r) => r.role === 'OPERATOR_ATTENDANT')
        ? await store.members.attendantLotIds(user.id)
        : [],
      aal: identity.aal,
    });
    await next();
  };
}

/**
 * Throws unless the actor may perform `action` on `resource`.
 * - Out-of-scope lookups by id return 404, not 403, to avoid enumeration (doc 05 §5.2 rule 3).
 * - A role that needs MFA but has an aal1 session gets AUTH_MFA_REQUIRED.
 * Every denial is logged as an `authz.denied` event (FR-AUTH-005).
 */
export function authorize(
  c: Context<AuthEnv>,
  logger: Logger,
  action: Action,
  resource: Resource,
  options: { denyAs?: 'NOT_FOUND' | 'FORBIDDEN' } = {},
): void {
  const actor = c.get('actor');
  if (can(actor, action, resource)) return;

  logger.warn(
    {
      event: 'authz.denied',
      action,
      userId: actor.userId,
      resource,
      requestId: c.get('requestId'),
    },
    'authorisation denied',
  );
  if (
    actor.aal !== 'aal2' &&
    needsAal2(actor) &&
    can({ ...actor, aal: 'aal2' }, action, resource)
  ) {
    throw new ApiError('AUTH_MFA_REQUIRED');
  }
  throw new ApiError(options.denyAs ?? 'FORBIDDEN');
}
