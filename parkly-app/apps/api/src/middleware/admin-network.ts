import { ipAllowed, parseAllowlist, type AllowRule } from '@parkly/domain/security';
import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { clientIp } from './rate-limit.js';

/**
 * Doc 05 sections 4.6 and 14: the admin API answers only to the office and VPN
 * networks, as a second lock behind the Vercel Firewall allowlist on the admin
 * domain. `ADMIN_IP_ALLOWLIST` lists addresses and ranges; empty switches it off
 * (local and dev). The address comes from `x-forwarded-for`, which Vercel sets.
 * A request from anywhere else gets 403 before any role is looked at, so it can't
 * tell a wrong network from a wrong role.
 */
export function adminNetwork(allowlist: string, logger: Logger): MiddlewareHandler {
  const { rules, invalid } = parseAllowlist(allowlist);
  if (invalid.length > 0)
    throw new Error(`ADMIN_IP_ALLOWLIST has entries that are not addresses: ${invalid.join(', ')}`);
  const active: readonly AllowRule[] = rules;
  return async (c, next) => {
    if (active.length > 0) {
      const ip = clientIp(c.req.header('x-forwarded-for'));
      if (!ipAllowed(ip === 'unknown' ? null : ip, active)) {
        logger.warn(
          { event: 'admin.network_denied', path: c.req.path, requestId: c.get('requestId') },
          'admin request from outside the allowlist',
        );
        throw new ApiError('ADMIN_IP_NOT_ALLOWED');
      }
    }
    await next();
  };
}
