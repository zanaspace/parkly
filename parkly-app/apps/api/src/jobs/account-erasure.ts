import type { Logger } from '../lib/logger.js';
import type { AuthAdmin } from '../providers/auth-admin.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const BATCH = 50;

/**
 * Doc 06 section 6.1 step 5: daily at 02:00 Lagos. Closes the accounts whose
 * 30-day grace has passed, in this order so a failure can always be retried:
 * 1. Still blocked by a booking or an unpaid overstay? Leave it, and say so in the log.
 * 2. Delete the Supabase Auth user (phone, password hash, factors, sessions).
 *    "Already gone" counts as done.
 * 3. Anonymise everything in our database, in one transaction.
 * Each account is independent: one failing doesn't stop the rest. The job only
 * ever logs ids and counts, never a name, phone or plate.
 */
export function accountErasureJob(deps: {
  store: Store;
  authAdmin: AuthAdmin;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  return async ({ deadline }) => {
    const now = deps.now();
    const due = await deps.store.dataRequests.dueDeletions(now, BATCH);
    let erased = 0;
    let waiting = 0;
    for (const dsr of due) {
      if (deps.now() >= deadline) break;
      try {
        const owed = await deps.store.dataRequests.obligations(dsr.userId, now);
        if (owed.activeBookings > 0 || owed.unpaidOverstays > 0) {
          waiting += 1;
          deps.logger.warn(
            { event: 'account_erasure.blocked', userId: dsr.userId, ...owed },
            'account erasure waiting on an active booking or unpaid overstay',
          );
          continue;
        }
        await deps.authAdmin.deleteUser(dsr.userId);
        const done = await deps.store.erasure.eraseUser(dsr.userId, dsr.id, deps.now());
        if (done === null) {
          // Erased already (an earlier run stopped before closing the request): just close it.
          await deps.store.dataRequests.complete(dsr.id, deps.now());
        }
        await deps.store.audit.write({
          actorUserId: null,
          actorRole: 'SYSTEM',
          action: 'account.erased',
          entityType: 'user',
          entityId: dsr.userId,
          after: done ?? { alreadyErased: true },
          ipHash: null,
          userAgent: null,
          requestId: null,
        });
        erased += 1;
      } catch (err) {
        waiting += 1;
        deps.logger.error(
          { err, event: 'account_erasure.failed', userId: dsr.userId },
          'account erasure failed; it will be retried',
        );
      }
    }
    return { processed: erased, remaining: waiting };
  };
}
