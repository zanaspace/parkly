import { randomUUID } from 'node:crypto';
import { confirmDecision, isBalanced, type JournalLine } from '@parkly/domain/booking';
import { settlePlan, type SettlePlan } from './settle-plan.js';
import {
  BookingCodeTakenError,
  BookingHoldError,
  type BookingRow,
  type LotRow,
  type PaymentRow,
  type SlotRow,
  type Store,
} from './types.js';

const SLOT_MS = 15 * 60_000;
const LIVE_STATUSES = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN']);

type History = {
  bookingId: string;
  from: string | null;
  to: string;
  actor: string;
  reason: string | null;
};
type Refund = {
  id: string;
  paymentId: string;
  amountKobo: number;
  reason: string;
  providerRefundId: string | null;
};
type Webhook = {
  id: string;
  key: string;
  eventType: string;
  reference: string | null;
  receivedAt: Date;
  attempts: number;
  status: string;
  error: string | null;
};
type IdemKey = {
  method: string;
  path: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  responseStatus: number | null;
  body: unknown;
  expiresAt: Date;
};

/**
 * Bookings, payments, webhooks and idempotency for MemoryStore. Mirrors
 * `fn_hold_booking`, `fn_convert_hold`, `fn_release_slots` and the ledger
 * balance trigger, so route tests see the same behaviour as Postgres.
 */
export class MemoryBookings {
  readonly bookingRows: BookingRow[] = [];
  readonly paymentRows: (PaymentRow & {
    feesKobo: number | null;
    channel: string | null;
    cardLast4: string | null;
    cardBrand: string | null;
    accessCode: string | null;
  })[] = [];
  readonly historyRows: History[] = [];
  readonly refundRows: Refund[] = [];
  readonly ledgerRows: (JournalLine & { journalId: string; paymentId: string })[] = [];
  readonly webhookRows: Webhook[] = [];
  readonly idempotencyRows = new Map<string, IdemKey>();

  constructor(
    private readonly lotRows: Map<string, LotRow>,
    private readonly slotRows: SlotRow[],
  ) {}

  private windowSlots(lotId: string, startAt: Date, endAt: Date, capacity: number | null) {
    const rows: SlotRow[] = [];
    for (let t = startAt.getTime(); t < endAt.getTime(); t += SLOT_MS) {
      let row = this.slotRows.find((s) => s.lotId === lotId && s.slotStart.getTime() === t);
      if (!row) {
        if (capacity === null) throw new Error(`no inventory row for ${lotId} at ${t}`);
        row = {
          lotId,
          slotStart: new Date(t),
          capacity,
          booked: 0,
          held: 0,
          passReserved: 0,
          blocked: 0,
        };
        this.slotRows.push(row);
      }
      rows.push(row);
    }
    return rows;
  }

  private free = (s: SlotRow) => s.capacity - s.booked - s.held - s.passReserved - s.blocked;

  /** Like `fn_move_booking_slots`: counters never go negative. */
  private move(b: BookingRow, held: number, booked: number) {
    const slots = this.windowSlots(b.lotId, b.startAt, b.endAt, null);
    if (slots.some((s) => s.held + held < 0 || s.booked + booked < 0))
      throw new Error('lot_slot_inventory_counts_check');
    for (const s of slots) {
      s.held += held;
      s.booked += booked;
    }
  }

  private payment(id: string) {
    const p = this.paymentRows.find((r) => r.id === id);
    if (!p) throw new Error(`payment ${id} not found`);
    return p;
  }

  private publicPayment(p: (typeof this.paymentRows)[number]): PaymentRow {
    const { feesKobo: _f, channel: _c, cardLast4: _l, cardBrand: _b, accessCode: _a, ...rest } = p;
    return { ...rest };
  }

  private apply(plan: SettlePlan, b: BookingRow, p: (typeof this.paymentRows)[number]) {
    if (plan.slots === 'convert') this.move(b, -1, 1);
    if (plan.slots === 'release') this.move(b, -1, 0);
    if (plan.booking) {
      b.status = plan.booking.to;
      b.holdExpiresAt = null;
      this.historyRows.push({
        bookingId: b.id,
        from: plan.booking.from,
        to: plan.booking.to,
        actor: 'SYSTEM',
        reason: plan.booking.reason,
      });
    }
    if (plan.payment) Object.assign(p, plan.payment);
    for (const lines of plan.journals) {
      if (!isBalanced(lines)) throw new Error('ledger journal is unbalanced');
      const journalId = randomUUID();
      for (const l of lines) this.ledgerRows.push({ ...l, journalId, paymentId: p.id });
    }
    let refund: Refund | null = null;
    if (plan.refund) {
      refund = { id: randomUUID(), paymentId: p.id, providerRefundId: null, ...plan.refund };
      this.refundRows.push(refund);
    }
    return refund;
  }

  readonly bookings: Store['bookings'] = {
    hold: async (input, payment, at) => {
      const { startAt, endAt } = input;
      if (endAt <= startAt || startAt.getTime() % SLOT_MS !== 0 || endAt.getTime() % SLOT_MS !== 0)
        throw new BookingHoldError('BOOKING_WINDOW_INVALID');
      const lot = this.lotRows.get(input.lotId);
      if (!lot || lot.status !== 'LIVE') throw new BookingHoldError('LOT_NOT_BOOKABLE');
      if (
        this.bookingRows.some(
          (b) =>
            b.vehicleId === input.vehicleId &&
            LIVE_STATUSES.has(b.status) &&
            b.startAt < endAt &&
            b.endAt > startAt,
        )
      )
        throw new BookingHoldError('BOOKING_OVERLAP_SAME_VEHICLE');
      if (this.bookingRows.some((b) => b.code === input.code)) throw new BookingCodeTakenError();
      const slots = this.windowSlots(lot.id, startAt, endAt, lot.capacityBookable);
      if (slots.some((s) => this.free(s) < 1))
        throw new BookingHoldError('BOOKING_SLOT_UNAVAILABLE');
      for (const s of slots) s.held += 1;

      const booking: BookingRow = {
        ...input,
        status: 'PENDING_PAYMENT',
        totalKobo: input.priceKobo + input.serviceFeeKobo,
        createdAt: at,
      };
      this.bookingRows.push(booking);
      this.historyRows.push({
        bookingId: booking.id,
        from: null,
        to: 'PENDING_PAYMENT',
        actor: input.source === 'ADMIN' ? 'ADMIN' : 'DRIVER',
        reason: null,
      });
      const row = {
        ...payment,
        bookingId: booking.id,
        status: 'INITIATED' as const,
        authorizationUrl: null,
        paidAt: null,
        failureCode: null,
        createdAt: at,
        feesKobo: null,
        channel: null,
        cardLast4: null,
        cardBrand: null,
        accessCode: null,
      };
      this.paymentRows.push(row);
      return { booking: { ...booking }, payment: this.publicPayment(row) };
    },

    find: async (id) => {
      const b = this.bookingRows.find((r) => r.id === id);
      return b ? { ...b } : null;
    },

    listForDriver: async (driverId, which, now, limit) => {
      const upcoming = (b: BookingRow) => LIVE_STATUSES.has(b.status) && b.endAt > now;
      return this.bookingRows
        .filter((b) => b.driverId === driverId && upcoming(b) === (which === 'upcoming'))
        .sort((a, b) =>
          which === 'upcoming'
            ? a.startAt.getTime() - b.startAt.getTime()
            : b.startAt.getTime() - a.startAt.getTime(),
        )
        .slice(0, limit)
        .map((b) => ({ ...b }));
    },

    listUpcomingForLot: async (lotId, now) => {
      return this.bookingRows
        .filter((b) => b.lotId === lotId && LIVE_STATUSES.has(b.status) && b.endAt > now)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map((b) => ({ ...b }));
    },

    releaseHold: async (id, reason) => {
      const b = this.bookingRows.find((r) => r.id === id);
      if (!b || b.status !== 'PENDING_PAYMENT') return;
      this.move(b, -1, 0);
      b.status = 'EXPIRED';
      b.holdExpiresAt = null;
      this.historyRows.push({
        bookingId: id,
        from: 'PENDING_PAYMENT',
        to: 'EXPIRED',
        actor: 'SYSTEM',
        reason,
      });
      for (const p of this.paymentRows)
        if (p.bookingId === id && p.status === 'INITIATED') {
          p.status = 'FAILED';
          p.failureCode = reason.slice(0, 64);
        }
    },
  };

  readonly payments: Store['payments'] = {
    find: async (id) => {
      const p = this.paymentRows.find((r) => r.id === id);
      return p ? this.publicPayment(p) : null;
    },

    latestForBooking: async (bookingId) => {
      const rows = this.paymentRows.filter((p) => p.bookingId === bookingId);
      const p = rows[rows.length - 1];
      return p ? this.publicPayment(p) : null;
    },

    checkoutStarted: async (id, checkout) => {
      const p = this.payment(id);
      if (p.status === 'INITIATED') {
        p.status = 'PENDING';
        p.authorizationUrl = checkout.authorizationUrl;
        p.accessCode = checkout.accessCode;
      }
      return this.publicPayment(p);
    },

    settle: async (id, charge) => {
      const p = this.payment(id);
      const b = this.bookingRows.find((r) => r.id === p.bookingId);
      if (!b) throw new Error(`payment ${id} has no booking`);
      let decision = confirmDecision({
        payment: { status: p.status, amountKobo: p.amountKobo },
        verify: charge,
        bookingStatus: b.status,
        capacityAvailable: true,
      });
      if (decision === 'REACQUIRE_AND_CONFIRM') {
        const lot = this.lotRows.get(b.lotId);
        const slots = this.windowSlots(b.lotId, b.startAt, b.endAt, lot?.capacityBookable ?? 0);
        if (slots.every((s) => this.free(s) >= 1)) for (const s of slots) s.booked += 1;
        else decision = 'REFUND_HOLD_EXPIRED';
      }
      const refund = this.apply(settlePlan(decision, charge, b, this.publicPayment(p)), b, p);
      return {
        decision,
        booking: { ...b },
        payment: this.publicPayment(p),
        refund: refund && { id: refund.id, amountKobo: refund.amountKobo },
      };
    },

    unsettled: async ({ from, to, limit }) =>
      this.paymentRows
        .filter((p) => p.status === 'PENDING' && p.createdAt >= from && p.createdAt < to)
        .slice(0, limit)
        .map((p) => p.id),

    refundRequested: async (refundId, providerRefundId) => {
      const r = this.refundRows.find((x) => x.id === refundId);
      if (r) r.providerRefundId = providerRefundId;
    },
  };

  readonly webhooks: Store['webhooks'] = {
    record: async (e) => {
      const key = `${e.provider}:${e.dedupeKey}`;
      const existing = this.webhookRows.find((w) => w.key === key);
      if (existing) return { id: existing.id, duplicate: true };
      const row = {
        id: randomUUID(),
        key,
        eventType: e.eventType,
        reference: e.reference,
        receivedAt: e.at,
        attempts: 0,
        status: 'PENDING',
        error: null,
      };
      this.webhookRows.push(row);
      return { id: row.id, duplicate: false };
    },
    finish: async (id, status, error) => {
      const w = this.webhookRows.find((r) => r.id === id);
      if (w) Object.assign(w, { status, error, attempts: w.attempts + 1 });
    },
    retryable: async (q) =>
      this.webhookRows
        .filter(
          (w) =>
            w.eventType === 'charge.success' &&
            (w.status === 'PENDING' || w.status === 'FAILED') &&
            w.attempts < q.maxAttempts &&
            w.receivedAt < q.before,
        )
        .slice(0, q.limit)
        .map((w) => ({ id: w.id, reference: w.reference })),
  };

  readonly idempotency: Store['idempotency'] = {
    begin: async (k) => {
      const id = `${k.actorId}:${k.key}`;
      const row = this.idempotencyRows.get(id);
      // Expired keys are purged by the hold-expiry job; until then they still replay.
      if (!row) {
        this.idempotencyRows.set(id, {
          method: k.method,
          path: k.path,
          requestHash: k.requestHash,
          status: 'IN_PROGRESS',
          responseStatus: null,
          body: null,
          expiresAt: k.expiresAt,
        });
        return { state: 'new' };
      }
      if (row.requestHash !== k.requestHash || row.method !== k.method || row.path !== k.path)
        return { state: 'mismatch' };
      if (row.status === 'IN_PROGRESS') return { state: 'in_progress' };
      return { state: 'replay', status: row.responseStatus ?? 200, body: row.body };
    },
    complete: async (actorId, key, status, body) => {
      const row = this.idempotencyRows.get(`${actorId}:${key}`);
      if (row) Object.assign(row, { status: 'COMPLETED', responseStatus: status, body });
    },
    release: async (actorId, key) => {
      const id = `${actorId}:${key}`;
      if (this.idempotencyRows.get(id)?.status === 'IN_PROGRESS') this.idempotencyRows.delete(id);
    },
  };
}
