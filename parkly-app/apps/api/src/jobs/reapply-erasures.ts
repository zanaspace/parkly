import type { Logger } from '../lib/logger.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

/**
 * Doc 06 §7: after restoring a database backup, re-scrub any user listed in
 * `erasure_log` so erased personal data cannot reappear from a pre-erasure snapshot.
 */
export function reapplyErasuresJob(deps: {
  store: Store;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  return async () => {
    const now = deps.now();
    const { reappliedUsers } = await deps.store.erasure.reapplyErasures(now);
    if (reappliedUsers > 0) {
      await deps.store.audit.write({
        actorUserId: null,
        actorRole: 'SYSTEM',
        action: 'erasure.reapplied_after_restore',
        entityType: 'erasure_log',
        entityId: null,
        before: null,
        after: {
          reapplied: reappliedUsers,
          reason: 'Post-restore erasure log enforcement (doc 06 §7)',
        },
        ipHash: null,
        userAgent: null,
        requestId: null,
      });
      deps.logger.info({ event: 'erasure.reapplied', reapplied: reappliedUsers }, 'reapplied erasures');
    }
    return { processed: reappliedUsers, remaining: 0 };
  };
}
