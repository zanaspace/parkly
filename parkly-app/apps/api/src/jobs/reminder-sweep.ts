import type { NotificationService } from '../notifications/service.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

/** FR-NOT-002: remind 60 minutes before the start and 15 minutes before the end. */
export const REMINDER_WINDOWS = { startWithinMin: 60, endWithinMin: 15 };
const MINUTE_MS = 60_000;

/**
 * Every 5 minutes (pg_cron): queues a reminder for each booking that has
 * entered a window and has none yet. The dedupe key makes reruns harmless, so
 * a missed run is caught by the next one.
 */
export function reminderSweepJob(deps: {
  store: Store;
  notifications: NotificationService;
  now: () => Date;
}): JobHandler {
  return async ({ deadline }) => {
    const now = deps.now();
    const due = await deps.store.notifications.dueReminders(now, REMINDER_WINDOWS);
    let processed = 0;
    for (const r of due) {
      if (deps.now() >= deadline) break;
      const base = {
        driverId: r.driverId,
        bookingId: r.bookingId,
        bookingCode: r.bookingCode,
        lotName: r.lotName,
      };
      if (r.kind === 'START')
        await deps.notifications.notify({
          key: 'booking.reminder_start',
          ...base,
          startAt: r.startAt.toISOString(),
          minutesUntil: Math.max(1, Math.round((r.startAt.getTime() - now.getTime()) / MINUTE_MS)),
        });
      else
        await deps.notifications.notify({
          key: 'booking.reminder_end',
          ...base,
          endAt: r.endAt.toISOString(),
          minutesLeft: Math.max(1, Math.round((r.endAt.getTime() - now.getTime()) / MINUTE_MS)),
        });
      processed += 1;
    }
    return { processed, remaining: due.length - processed };
  };
}
