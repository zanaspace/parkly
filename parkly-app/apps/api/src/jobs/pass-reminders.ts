import { passRenewalReminderDue } from '@parkly/domain/pass';
import { lagosDateKey } from '@parkly/domain/time';
import type { Logger } from '../lib/logger.js';
import type { NotificationService } from '../notifications/service.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const BATCH = 50;

/**
 * FR-PASS-003: expires monthly passes whose period has ended or whose hold
 * timed out, and sends 7-day and 2-day renewal reminders.
 */
export function passRemindersJob(deps: {
  store: Store;
  notifications: NotificationService;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  return async () => {
    const now = deps.now();
    const today = lagosDateKey(now);
    const passes = await deps.store.passes.dueForExpiryOrReminder(today, BATCH);
    let expired = 0;
    let reminded = 0;

    for (const pass of passes) {
      if (pass.periodEnd < today) {
        const ok = await deps.store.passes.expire(pass.id, now);
        if (ok) expired += 1;
        continue;
      }
      const daysLeft = passRenewalReminderDue({
        status: pass.status,
        periodEnd: pass.periodEnd,
        todayLagos: today,
        lastReminderDays: pass.lastReminderDays,
      });
      if (daysLeft === null) continue;

      try {
        const lot = await deps.store.lots.findById(pass.lotId);
        await deps.notifications.notify(
          {
            key: 'pass.expiring',
            passId: pass.id,
            bookingId: pass.id,
            bookingCode: pass.code,
            driverId: pass.driverId,
            lotName: lot?.name ?? 'Car Park',
            periodEnd: pass.periodEnd,
            daysRemaining: daysLeft as 7 | 2,
          },
          `pass.expiring:${pass.id}:${daysLeft}d`,
        );
        await deps.store.passes.markReminded(pass.id, daysLeft);
        reminded += 1;
      } catch (err) {
        deps.logger.error({ err, passId: pass.id, daysLeft }, 'pass reminder failed');
      }
    }

    return {
      processed: expired + reminded,
      remaining: passes.length === BATCH ? BATCH : 0,
    };
  };
}
