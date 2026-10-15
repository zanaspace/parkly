import type { Context } from 'hono';
import type { AuthEnv } from '../auth/context.js';
import { clientIp } from '../middleware/rate-limit.js';
import type { Store } from '../store/types.js';
import type { FieldCrypto } from './crypto.js';

/** Writes one append-only audit row for a privileged action (FR-AUTH-008). */
export async function audit(
  c: Context<AuthEnv>,
  deps: { store: Store; crypto: FieldCrypto },
  entry: {
    action: string;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  const actor = c.get('actor');
  const ip = clientIp(c.req.header('x-forwarded-for'));
  await deps.store.audit.write({
    actorUserId: actor.userId,
    actorRole: actor.roles.map((r) => r.role).join(',') || null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    ipHash: ip === 'unknown' ? null : deps.crypto.lookupHash(ip),
    userAgent: c.req.header('user-agent')?.slice(0, 256) ?? null,
    requestId: c.get('requestId') ?? null,
  });
}
