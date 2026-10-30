import { randomUUID } from 'node:crypto';
import {
  addOnDecision,
  allocateRefund,
  confirmDecision,
  isBalanced,
  type JournalLine,
} from '@parkly/domain/booking';
import { addOnSettlePlan, settlePlan, type SettlePlan } from './settle-plan.js';
import {
  BookingCodeTakenError,
  BookingHoldError,
  type BookingExtensionRow,
  type BookingRow,
  type LotRow,
  type PaymentRow,
  type RefundRow,
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
  status?: 'PENDING' | 'SUCCEEDED' | 'FAILED';
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
  readonly extensionRows: (BookingExtensionRow & { paymentId: string | null })[] = [];
  readonly refundRows: Refund[] = [];
  readonly ledgerRows: (JournalLine & { journalId: string; paymentId: string })[] = [];
  readonly webhookRows: Webhook[] = [];
  readonly idempotencyRows = new Map<string, IdemKey>();
  onOverstayPaid?: (bookingId: string) => Promise<void> | void;
  overstayDue?: (bookingId: string) => boolean;

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
      const is5Min = endAt.getTime() - startAt.getTime() === 5 * 60_000;
      if (
        endAt <= startAt ||
        startAt.getTime() % SLOT_MS !== 0 ||
        (!is5Min && endAt.getTime() % SLOT_MS !== 0)
      )
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
    findByCode: async (code) => {
      const b = this.bookingRows.find((r) => r.code === code);
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

    holdExtension: async (ext, payment, at) => {
      const b = this.bookingRows.find((r) => r.id === ext.bookingId);
      if (!b) throw new BookingHoldError('BOOKING_NOT_EXTENDABLE');
      if (b.status !== 'CONFIRMED' && b.status !== 'CHECKED_IN')
        throw new BookingHoldError('BOOKING_NOT_EXTENDABLE');
      const addedMinutes = Math.round((ext.newEndAt.getTime() - b.endAt.getTime()) / 60_000);
      const is5Min = addedMinutes === 5;
      if (ext.newEndAt <= b.endAt || (!is5Min && ext.newEndAt.getTime() % SLOT_MS !== 0))
        throw new BookingHoldError('BOOKING_WINDOW_INVALID');
      const lot = this.lotRows.get(b.lotId);
      if (!lot || lot.status !== 'LIVE') throw new BookingHoldError('LOT_NOT_BOOKABLE');
      // As fn_hold_extension: a new request replaces the driver's own unpaid one.
      for (const prev of this.extensionRows.filter(
        (r) => r.bookingId === b.id && r.status === 'PENDING_PAYMENT',
      ))
        await this.bookings.releaseExtension(prev.id, 'EXPIRED', at);
      if (
        this.bookingRows.some(
          (o) =>
            o.id !== b.id &&
            o.vehicleId === b.vehicleId &&
            LIVE_STATUSES.has(o.status) &&
            o.startAt < ext.newEndAt &&
            o.endAt > b.endAt,
        )
      )
        throw new BookingHoldError('BOOKING_OVERLAP_SAME_VEHICLE');

      const slots = this.windowSlots(lot.id, b.endAt, ext.newEndAt, lot.capacityBookable);
      if (slots.some((s) => this.free(s) < 1))
        throw new BookingHoldError('BOOKING_SLOT_UNAVAILABLE');
      for (const s of slots) s.held += 1;

      const extensionRow: BookingExtensionRow & { paymentId: string | null } = {
        id: ext.id,
        bookingId: ext.bookingId,
        startAt: b.endAt,
        newEndAt: ext.newEndAt,
        addedMinutes,
        priceKobo: ext.priceKobo,
        platformAmountKobo: ext.platformAmountKobo,
        operatorAmountKobo: ext.operatorAmountKobo,
        paymentId: payment ? payment.id : null,
        status: 'PENDING_PAYMENT',
        createdAt: at,
      };
      this.extensionRows.push(extensionRow);

      let paymentRow: PaymentRow | null = null;
      if (payment) {
        const row = {
          ...payment,
          kind: 'EXTENSION' as const,
          bookingId: b.id,
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
        paymentRow = this.publicPayment(row);
      }
      return { extension: { ...extensionRow }, payment: paymentRow };
    },

    releaseExtension: async (id, status) => {
      const ext = this.extensionRows.find((r) => r.id === id);
      if (!ext || ext.status !== 'PENDING_PAYMENT') return false;
      const b = this.bookingRows.find((r) => r.id === ext.bookingId);
      if (b)
        for (const s of this.windowSlots(b.lotId, ext.startAt, ext.newEndAt, null)) s.held -= 1;
      ext.status = status;
      const p = this.paymentRows.find((r) => r.id === ext.paymentId);
      if (p?.status === 'INITIATED')
        Object.assign(p, { status: 'FAILED', failureCode: 'extension.released' });
      return true;
    },

    confirmExtension: async (extensionId, paymentId, _at) => {
      const ext = this.extensionRows.find((r) => r.id === extensionId);
      if (!ext) throw new Error('EXTENSION_NOT_FOUND');
      if (ext.status !== 'PENDING_PAYMENT') throw new Error('EXTENSION_ALREADY_CONFIRMED');
      const b = this.bookingRows.find((r) => r.id === ext.bookingId);
      if (!b) throw new BookingHoldError('BOOKING_NOT_EXTENDABLE');
      if (
        (b.status !== 'CONFIRMED' && b.status !== 'CHECKED_IN') ||
        ext.startAt.getTime() !== b.endAt.getTime()
      )
        throw new Error('EXTENSION_NOT_APPLICABLE');

      const slots = this.windowSlots(b.lotId, ext.startAt, ext.newEndAt, null);
      for (const s of slots) {
        s.held -= 1;
        s.booked += 1;
      }
      ext.status = 'CONFIRMED';
      ext.paymentId = paymentId;
      b.endAt = ext.newEndAt;
      b.priceKobo += ext.priceKobo;
      b.totalKobo += ext.priceKobo;
      return { ...b };
    },

    findExtension: async (id) => {
      const ext = this.extensionRows.find((r) => r.id === id);
      return ext ? { ...ext } : null;
    },

    cancel: async (bookingId, actor, actorId, reason, refund, at) => {
      const b = this.bookingRows.find((r) => r.id === bookingId);
      if (!b) throw new BookingHoldError('BOOKING_NOT_CANCELLABLE');
      if (b.status !== 'PENDING_PAYMENT' && b.status !== 'CONFIRMED')
        throw new BookingHoldError('BOOKING_NOT_CANCELLABLE');

      for (const ext of this.extensionRows.filter(
        (r) => r.bookingId === b.id && r.status === 'PENDING_PAYMENT',
      ))
        await this.bookings.releaseExtension(ext.id, 'CANCELLED', at);
      if (b.status === 'CONFIRMED') this.move(b, 0, -1);
      else if (b.status === 'PENDING_PAYMENT') this.move(b, -1, 0);

      const fromStatus = b.status;
      b.status = 'CANCELLED';
      this.historyRows.push({
        bookingId: b.id,
        from: fromStatus,
        to: 'CANCELLED',
        actor,
        reason,
      });

      const created: { id: string; paymentId: string; amountKobo: number }[] = [];
      if (refund && refund.amountKobo > 0) {
        const paid = this.paymentRows
          .filter(
            (p) =>
              p.bookingId === bookingId &&
              (p.kind ?? 'BOOKING') !== 'OVERSTAY' &&
              (p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED'),
          )
          .reverse();
        if (paid.length === 0) throw new Error(`no successful payment for booking ${bookingId}`);
        const split = allocateRefund(
          refund.amountKobo,
          paid.map((p) => ({
            id: p.id,
            amountKobo: p.amountKobo,
            refundedKobo: this.refundRows
              .filter((r) => r.paymentId === p.id && r.status !== 'FAILED')
              .reduce((n, r) => n + r.amountKobo, 0),
          })),
        );
        if (!split) throw new Error(`refund exceeds what booking ${bookingId} paid`);
        for (const part of split) {
          const id = randomUUID();
          this.refundRows.push({
            id,
            paymentId: part.paymentId,
            amountKobo: part.amountKobo,
            reason: refund.reason,
            providerRefundId: null,
            status: 'PENDING',
          });
          created.push({ id, ...part });
        }
      }
      return { booking: { ...b }, refunds: created };
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

    listForBooking: async (bookingId) => {
      return this.paymentRows
        .filter((p) => p.bookingId === bookingId)
        .map((p) => this.publicPayment(p));
    },

    refundsForBooking: async (bookingId) => {
      const paymentIds = new Set(
        this.paymentRows.filter((p) => p.bookingId === bookingId).map((p) => p.id),
      );
      return this.refundRows
        .filter((r) => paymentIds.has(r.paymentId))
        .map((r) => ({
          id: r.id,
          paymentId: r.paymentId,
          amountKobo: r.amountKobo,
          reason: r.reason as RefundRow['reason'],
          status: 'SUCCEEDED' as const,
          providerRefundId: r.providerRefundId,
          requestedBy: null,
          approvedBy: null,
          note: null,
          createdAt: new Date(),
        }));
    },

    create: async (payment, at) => {
      const row = {
        ...payment,
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
      return this.publicPayment(row);
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

      if (p.kind === 'EXTENSION' || p.kind === 'OVERSTAY') {
        const ext =
          p.kind === 'EXTENSION' ? this.extensionRows.find((r) => r.paymentId === p.id) : undefined;
        const applicable =
          p.kind === 'EXTENSION'
            ? !!ext &&
              ext.status === 'PENDING_PAYMENT' &&
              (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') &&
              ext.startAt.getTime() === b.endAt.getTime()
            : (this.overstayDue?.(b.id) ?? false);
        const decision = addOnDecision({
          payment: { status: p.status, amountKobo: p.amountKobo },
          verify: charge,
          applicable,
        });
        const plan = addOnSettlePlan(decision, charge, b, this.publicPayment(p));
        if (plan.applyAddOn) {
          if (ext) await this.bookings.confirmExtension(ext.id, p.id, new Date());
          else await this.onOverstayPaid?.(b.id);
        }
        const refund = this.apply(plan, b, p);
        return {
          decision,
          booking: { ...b },
          payment: this.publicPayment(p),
          refund: refund && { id: refund.id, amountKobo: refund.amountKobo },
        };
      }

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

    refundsToRetry: async ({ limit }) =>
      this.refundRows
        .filter((r) => (r.status ?? 'PENDING') === 'PENDING' && r.providerRefundId === null)
        .slice(0, limit)
        .map((r) => ({ id: r.id, paymentId: r.paymentId, amountKobo: r.amountKobo })),

    refundOutcome: async ({ providerRefundId, paymentId, status }) => {
      const rows = this.refundRows.filter((r) => r.paymentId === paymentId);
      const match =
        rows.find((r) => providerRefundId && r.providerRefundId === providerRefundId) ??
        rows.find((r) => (r.status ?? 'PENDING') === 'PENDING');
      if (!match || (match.status ?? 'PENDING') !== 'PENDING') return Boolean(match);
      match.status = status;
      const p = this.paymentRows.find((r) => r.id === paymentId);
      if (p && status === 'SUCCEEDED') {
        const refunded = rows
          .filter((r) => r.status === 'SUCCEEDED')
          .reduce((n, r) => n + r.amountKobo, 0);
        p.status = refunded >= p.amountKobo ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      }
      return true;
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
