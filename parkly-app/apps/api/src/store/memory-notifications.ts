import { v7 as uuidv7 } from 'uuid';
import type { BookingRow, LotRow, NotificationRow, ReminderCandidate, Store } from './types.js';

const MINUTE_MS = 60_000;

/** In-memory notification outbox, mirroring the Postgres table's unique dedupe key. */
export class MemoryNotifications {
  readonly rows: NotificationRow[] = [];

  constructor(
    private readonly deps: {
      bookingRows: () => BookingRow[];
      lotRows: Map<string, LotRow>;
    },
  ) {}

  readonly notifications: Store['notifications'] = {
    enqueue: async (row) => {
      if (this.rows.some((r) => r.dedupeKey === row.dedupeKey)) return false;
      this.rows.push({
        id: uuidv7(),
        userId: row.userId,
        bookingId: row.bookingId,
        eventKey: row.eventKey,
        dedupeKey: row.dedupeKey,
        payload: structuredClone(row.payload),
        status: 'PENDING',
        channelsDone: [],
        attempts: 0,
        nextAttemptAt: row.notBefore,
        lastError: null,
        sentAt: null,
      });
      return true;
    },

    claimDue: async (now, limit, leaseUntil) => {
      const due = this.rows
        .filter((r) => r.status === 'PENDING' && r.nextAttemptAt.getTime() <= now.getTime())
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
        .slice(0, limit);
      for (const r of due) {
        r.attempts += 1;
        r.nextAttemptAt = leaseUntil;
      }
      return due.map((r) => ({ ...r, channelsDone: [...r.channelsDone] }));
    },

    finish: async (id, outcome) => {
      const r = this.rows.find((x) => x.id === id);
      if (r) Object.assign(r, outcome, { channelsDone: [...outcome.channelsDone] });
    },

    dueReminders: async (now, windows) => {
      const queued = new Set(this.rows.map((r) => r.dedupeKey));
      const t = now.getTime();
      const out: ReminderCandidate[] = [];
      for (const b of this.deps.bookingRows()) {
        const lotName = this.deps.lotRows.get(b.lotId)?.name ?? 'the car park';
        const base = {
          bookingId: b.id,
          driverId: b.driverId,
          bookingCode: b.code,
          lotName,
          startAt: b.startAt,
          endAt: b.endAt,
        };
        const start = b.startAt.getTime();
        if (
          b.status === 'CONFIRMED' &&
          start > t &&
          start <= t + windows.startWithinMin * MINUTE_MS &&
          !queued.has(`booking.reminder_start:${b.id}`)
        )
          out.push({ kind: 'START', ...base });
        const end = b.endAt.getTime();
        if (
          (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') &&
          end > t &&
          end <= t + windows.endWithinMin * MINUTE_MS &&
          !queued.has(`booking.reminder_end:${b.id}`)
        )
          out.push({ kind: 'END', ...base });
      }
      return out;
    },
  };
}
