import type { Logger } from '../lib/logger.js';
import type { NotificationService } from '../notifications/service.js';
import type { BookingRow, Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

export function reminderSweepJob(deps: {
  store: Store;
  notifications: NotificationService;
  logger: Logger;
  now: () => Date;
  sentReminders?: Set<string>;
}): JobHandler {
  const sent = deps.sentReminders ?? new Set<string>();

  return async ({ deadline }) => {
    const now = deps.now();
    let processed = 0;
    const remaining = 0;

    // We check all upcoming bookings in store
    // In memory store, we can access bookingRows if present or check drivers
    const bookingsList: BookingRow[] = [];
    const mem = deps.store as unknown as { booking?: { bookingRows?: BookingRow[] } };
    if (mem.booking?.bookingRows) {
      bookingsList.push(...mem.booking.bookingRows);
    }

    for (const b of bookingsList) {
      if (deps.now() >= deadline) break;

      const lot = await deps.store.lots.findById(b.lotId);
      const lotName = lot?.name ?? 'Car Park';

      // 1. Check start reminder (starts in 25-45 minutes)
      if (b.status === 'CONFIRMED') {
        const startDiffMs = b.startAt.getTime() - now.getTime();
        const startDiffMins = Math.round(startDiffMs / 60_000);
        const startKey = `start:${b.id}`;

        if (startDiffMins >= 25 && startDiffMins <= 45 && !sent.has(startKey)) {
          sent.add(startKey);
          await deps.notifications.dispatch({
            key: 'booking.reminder_start',
            driverId: b.driverId,
            bookingId: b.id,
            bookingCode: b.code,
            lotName,
            startAt: b.startAt.toISOString(),
            minutesUntil: startDiffMins,
          });
          processed += 1;
        }
      }

      // 2. Check expiry reminder (ends in 10-20 minutes)
      if (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') {
        const endDiffMs = b.endAt.getTime() - now.getTime();
        const endDiffMins = Math.round(endDiffMs / 60_000);
        const endKey = `end:${b.id}`;

        if (endDiffMins >= 10 && endDiffMins <= 20 && !sent.has(endKey)) {
          sent.add(endKey);
          await deps.notifications.dispatch({
            key: 'booking.reminder_end',
            driverId: b.driverId,
            bookingId: b.id,
            bookingCode: b.code,
            lotName,
            endAt: b.endAt.toISOString(),
            minutesLeft: endDiffMins,
          });
          processed += 1;
        }
      }
    }

    return { processed, remaining };
  };
}
