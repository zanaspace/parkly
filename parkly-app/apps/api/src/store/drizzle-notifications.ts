import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { and, eq, gt, inArray, lte, notExists, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { NotificationRow, ReminderCandidate, Store } from './types.js';

const { notifications, bookings, lots } = schema;

const columns = {
  id: notifications.id,
  userId: notifications.userId,
  bookingId: notifications.bookingId,
  eventKey: notifications.eventKey,
  dedupeKey: notifications.dedupeKey,
  payload: notifications.payload,
  status: notifications.status,
  channelsDone: notifications.channelsDone,
  attempts: notifications.attempts,
  nextAttemptAt: notifications.nextAttemptAt,
  lastError: notifications.lastError,
  sentAt: notifications.sentAt,
};

const MINUTE_MS = 60_000;

/** Notification outbox in Postgres (ADR 0020). */
export function drizzleNotifications(db: Db): Store['notifications'] {
  // A reminder is queued under `<event key>:<booking id>`; skip bookings that have one.
  const notQueued = (eventKey: string) =>
    notExists(
      db
        .select({ one: sql`1` })
        .from(notifications)
        .where(eq(notifications.dedupeKey, sql`${eventKey} || ':' || ${bookings.id}::text`)),
    );

  const candidates = async (
    kind: ReminderCandidate['kind'],
    where: ReturnType<typeof and>,
  ): Promise<ReminderCandidate[]> => {
    const rows = await db
      .select({
        bookingId: bookings.id,
        driverId: bookings.driverId,
        bookingCode: bookings.code,
        lotName: lots.name,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
      })
      .from(bookings)
      .innerJoin(lots, eq(lots.id, bookings.lotId))
      .where(where);
    return rows.map((r) => ({ kind, ...r }));
  };

  return {
    async enqueue(row) {
      const inserted = await db
        .insert(notifications)
        .values({
          id: uuidv7(),
          userId: row.userId,
          bookingId: row.bookingId,
          eventKey: row.eventKey,
          dedupeKey: row.dedupeKey,
          payload: row.payload,
          nextAttemptAt: row.notBefore,
        })
        .onConflictDoNothing({ target: notifications.dedupeKey })
        .returning({ id: notifications.id });
      return inserted.length > 0;
    },

    async claimDue(now, limit, leaseUntil) {
      // SKIP LOCKED: two overlapping job runs never take the same row.
      const due = db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.status, 'PENDING'), lte(notifications.nextAttemptAt, now)))
        .orderBy(notifications.nextAttemptAt)
        .limit(limit)
        .for('update', { skipLocked: true });
      const rows = await db
        .update(notifications)
        .set({ attempts: sql`${notifications.attempts} + 1`, nextAttemptAt: leaseUntil })
        .where(inArray(notifications.id, due))
        .returning(columns);
      return rows as NotificationRow[];
    },

    async finish(id, outcome) {
      await db.update(notifications).set(outcome).where(eq(notifications.id, id));
    },

    async dueReminders(now, windows) {
      const startBy = new Date(now.getTime() + windows.startWithinMin * MINUTE_MS);
      const endBy = new Date(now.getTime() + windows.endWithinMin * MINUTE_MS);
      const [starts, ends] = await Promise.all([
        candidates(
          'START',
          and(
            eq(bookings.status, 'CONFIRMED'),
            gt(bookings.startAt, now),
            lte(bookings.startAt, startBy),
            notQueued('booking.reminder_start'),
          ),
        ),
        candidates(
          'END',
          and(
            inArray(bookings.status, ['CONFIRMED', 'CHECKED_IN']),
            gt(bookings.endAt, now),
            lte(bookings.endAt, endBy),
            notQueued('booking.reminder_end'),
          ),
        ),
      ]);
      return [...starts, ...ends];
    },
  };
}
