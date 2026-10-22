import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { accountType, confirmDecision, isBalanced, type JournalLine } from '@parkly/domain/booking';
import { and, asc, desc, eq, gt, inArray, lte, notInArray, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { settlePlan, type SettlePlan } from './settle-plan.js';
import {
  BookingCodeTakenError,
  BookingHoldError,
  type BookingHoldCode,
  type BookingRow,
  type PaymentRow,
  type Store,
} from './types.js';

const {
  bookings,
  bookingStatusHistory,
  payments,
  refunds,
  webhookEvents,
  idempotencyKeys,
  ledgerAccounts,
  ledgerEntries,
} = schema;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const HOLD_CODES = new Set<BookingHoldCode>([
  'BOOKING_SLOT_UNAVAILABLE',
  'BOOKING_OVERLAP_SAME_VEHICLE',
  'LOT_NOT_BOOKABLE',
  'BOOKING_WINDOW_INVALID',
]);
const LIVE = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'] as const;

/** The Postgres error under Drizzle's wrapper. */
function pgError(err: unknown): { code?: string; message?: string; constraint_name?: string } {
  const e = err as { code?: string; cause?: unknown };
  return (e.code ? e : (e.cause ?? {})) as { code?: string; message?: string };
}

const bookingColumns = {
  id: bookings.id,
  code: bookings.code,
  driverId: bookings.driverId,
  vehicleId: bookings.vehicleId,
  plateNorm: bookings.plateNormSnapshot,
  lotId: bookings.lotId,
  product: bookings.product,
  startAt: bookings.startAt,
  endAt: bookings.endAt,
  status: bookings.status,
  holdExpiresAt: bookings.holdExpiresAt,
  priceKobo: bookings.priceKobo,
  serviceFeeKobo: bookings.serviceFeeKobo,
  totalKobo: bookings.totalKobo,
  commissionBps: bookings.commissionBps,
  ratePlanId: bookings.ratePlanId,
  pricingBreakdown: bookings.pricingBreakdown,
  source: bookings.source,
  createdAt: bookings.createdAt,
};

const paymentColumns = {
  id: payments.id,
  bookingId: payments.bookingId,
  payerUserId: payments.payerUserId,
  provider: payments.provider,
  status: payments.status,
  amountKobo: payments.amountKobo,
  platformAmountKobo: payments.platformAmountKobo,
  operatorAmountKobo: payments.operatorAmountKobo,
  operatorId: payments.operatorId,
  subaccountCode: payments.subaccountCode,
  authorizationUrl: payments.authorizationUrl,
  paidAt: payments.paidAt,
  failureCode: payments.failureCode,
  createdAt: payments.createdAt,
};

// The bookings CHECK limits product to HOURLY/DAILY; the column type is the shared enum.
const asBooking = (r: Omit<BookingRow, 'product'> & { product: string }): BookingRow =>
  r as BookingRow;
const asPayment = (r: Omit<PaymentRow, 'provider'> & { provider: string }): PaymentRow =>
  r as PaymentRow;

/** Account id for a code, creating OPERATOR_PAYABLE:<id> accounts on first use. */
async function accountIds(tx: Tx, codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes)];
  await tx
    .insert(ledgerAccounts)
    .values(
      unique.map((code) => ({
        id: uuidv7(),
        code,
        type: accountType(code),
        operatorId: code.startsWith('OPERATOR_PAYABLE:') ? code.slice(17) : null,
      })),
    )
    .onConflictDoNothing({ target: ledgerAccounts.code });
  const rows = await tx
    .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
    .from(ledgerAccounts)
    .where(inArray(ledgerAccounts.code, unique));
  return new Map(rows.map((r) => [r.code, r.id]));
}

async function postJournal(tx: Tx, lines: JournalLine[], paymentId: string) {
  if (!isBalanced(lines)) throw new Error('ledger journal is unbalanced');
  const ids = await accountIds(
    tx,
    lines.map((l) => l.account),
  );
  const journalId = uuidv7();
  await tx.insert(ledgerEntries).values(
    lines.map((l) => ({
      id: uuidv7(),
      journalId,
      accountId: ids.get(l.account) ?? '',
      direction: l.direction,
      amountKobo: l.amountKobo,
      paymentId,
    })),
  );
}

async function applyPlan(
  tx: Tx,
  plan: SettlePlan,
  booking: BookingRow,
  paymentId: string,
  at: Date,
) {
  if (plan.slots === 'convert') await tx.execute(sql`select public.fn_convert_hold(${booking.id})`);
  if (plan.slots === 'release')
    await tx.execute(sql`select public.fn_release_slots(${booking.id}, 'held')`);
  if (plan.booking) {
    await tx
      .update(bookings)
      .set({
        status: plan.booking.to,
        holdExpiresAt: null,
        version: sql`${bookings.version} + 1`,
        updatedAt: at,
      })
      .where(eq(bookings.id, booking.id));
    await tx.insert(bookingStatusHistory).values({
      id: uuidv7(),
      bookingId: booking.id,
      fromStatus: plan.booking.from,
      toStatus: plan.booking.to,
      actorType: 'SYSTEM',
      reason: plan.booking.reason,
      createdAt: at,
    });
  }
  if (plan.payment)
    await tx
      .update(payments)
      .set({ ...plan.payment, version: sql`${payments.version} + 1`, updatedAt: at })
      .where(eq(payments.id, paymentId));
  for (const lines of plan.journals) await postJournal(tx, lines, paymentId);
  if (!plan.refund) return null;
  const refundId = uuidv7();
  await tx.insert(refunds).values({
    id: refundId,
    paymentId,
    amountKobo: plan.refund.amountKobo,
    reason: plan.refund.reason,
    createdAt: at,
  });
  return { id: refundId, amountKobo: plan.refund.amountKobo };
}

/** Sprint 4 parts of DrizzleStore: bookings, payments, webhooks, idempotency keys. */
export function drizzleBookings(
  db: Db,
): Pick<Store, 'bookings' | 'payments' | 'webhooks' | 'idempotency'> {
  return {
    bookings: {
      async hold(input, payment, at) {
        try {
          return await db.transaction(async (tx) => {
            await tx.execute(sql`
              select public.fn_hold_booking(
                ${input.id}, ${input.code}, ${input.driverId}, ${input.vehicleId},
                ${input.plateNorm}, ${input.lotId}, ${input.product}::public.product,
                ${input.startAt.toISOString()}::timestamptz, ${input.endAt.toISOString()}::timestamptz,
                ${input.holdExpiresAt.toISOString()}::timestamptz, ${input.priceKobo},
                ${input.serviceFeeKobo}, ${input.commissionBps}, ${input.ratePlanId},
                ${JSON.stringify(input.pricingBreakdown)}::jsonb, ${input.source}::public.booking_source
              )`);
            await tx.insert(payments).values({
              ...payment,
              kind: 'BOOKING',
              bookingId: input.id,
              providerReference: payment.id,
              createdAt: at,
              updatedAt: at,
            });
            const [booking] = await tx
              .select(bookingColumns)
              .from(bookings)
              .where(eq(bookings.id, input.id));
            const [row] = await tx
              .select(paymentColumns)
              .from(payments)
              .where(eq(payments.id, payment.id));
            if (!booking || !row) throw new Error('booking hold not saved');
            return { booking: asBooking(booking), payment: asPayment(row) };
          });
        } catch (err) {
          const pg = pgError(err);
          if (pg.message && HOLD_CODES.has(pg.message as BookingHoldCode))
            throw new BookingHoldError(pg.message as BookingHoldCode);
          if (pg.code === '23505' && pg.constraint_name === 'bookings_code_key')
            throw new BookingCodeTakenError();
          throw err;
        }
      },

      async find(id) {
        const [row] = await db.select(bookingColumns).from(bookings).where(eq(bookings.id, id));
        return row ? asBooking(row) : null;
      },

      async listForDriver(driverId, which, now, limit) {
        const upcoming = and(inArray(bookings.status, [...LIVE]), gt(bookings.endAt, now));
        const past = or(notInArray(bookings.status, [...LIVE]), lte(bookings.endAt, now));
        const rows = await db
          .select(bookingColumns)
          .from(bookings)
          .where(and(eq(bookings.driverId, driverId), which === 'upcoming' ? upcoming : past))
          .orderBy(which === 'upcoming' ? asc(bookings.startAt) : desc(bookings.startAt))
          .limit(limit);
        return rows.map(asBooking);
      },

      async releaseHold(id, reason, at) {
        await db.transaction(async (tx) => {
          const [b] = await tx
            .select(bookingColumns)
            .from(bookings)
            .where(eq(bookings.id, id))
            .for('update');
          if (!b || b.status !== 'PENDING_PAYMENT') return;
          await applyPlan(
            tx,
            {
              payment: null,
              booking: { from: 'PENDING_PAYMENT', to: 'EXPIRED', reason },
              slots: 'release',
              journals: [],
              refund: null,
            },
            asBooking(b),
            '',
            at,
          );
          await tx
            .update(payments)
            .set({ status: 'FAILED', failureCode: reason.slice(0, 64), updatedAt: at })
            .where(and(eq(payments.bookingId, id), eq(payments.status, 'INITIATED')));
        });
      },
    },

    payments: {
      async find(id) {
        const [row] = await db.select(paymentColumns).from(payments).where(eq(payments.id, id));
        return row ? asPayment(row) : null;
      },

      async latestForBooking(bookingId) {
        const [row] = await db
          .select(paymentColumns)
          .from(payments)
          .where(eq(payments.bookingId, bookingId))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        return row ? asPayment(row) : null;
      },

      async checkoutStarted(id, checkout, at) {
        await db
          .update(payments)
          .set({
            status: 'PENDING',
            authorizationUrl: checkout.authorizationUrl,
            providerAccessCode: checkout.accessCode,
            updatedAt: at,
          })
          .where(and(eq(payments.id, id), eq(payments.status, 'INITIATED')));
        const [row] = await db.select(paymentColumns).from(payments).where(eq(payments.id, id));
        if (!row) throw new Error(`payment ${id} not found`);
        return asPayment(row);
      },

      async settle(id, charge, at) {
        return db.transaction(async (tx) => {
          const [p] = await tx
            .select(paymentColumns)
            .from(payments)
            .where(eq(payments.id, id))
            .for('update');
          if (!p?.bookingId) throw new Error(`payment ${id} has no booking`);
          const [b] = await tx
            .select(bookingColumns)
            .from(bookings)
            .where(eq(bookings.id, p.bookingId))
            .for('update');
          if (!b) throw new Error(`payment ${id} has no booking`);
          const booking = asBooking(b);
          const payment = asPayment(p);

          let decision = confirmDecision({
            payment: { status: payment.status, amountKobo: payment.amountKobo },
            verify: charge,
            bookingStatus: booking.status,
            capacityAvailable: true,
          });
          if (decision === 'REACQUIRE_AND_CONFIRM') {
            const [r] = await tx.execute<{ ok: boolean }>(
              sql`select public.fn_reacquire_booking(${booking.id}) as ok`,
            );
            if (!r?.ok) decision = 'REFUND_HOLD_EXPIRED';
          }
          const refund = await applyPlan(
            tx,
            settlePlan(decision, charge, booking, payment),
            booking,
            payment.id,
            at,
          );
          const [after] = await tx
            .select(bookingColumns)
            .from(bookings)
            .where(eq(bookings.id, booking.id));
          const [paid] = await tx.select(paymentColumns).from(payments).where(eq(payments.id, id));
          if (!after || !paid) throw new Error('settlement rows vanished');
          return { decision, booking: asBooking(after), payment: asPayment(paid), refund };
        });
      },

      async refundRequested(refundId, providerRefundId) {
        await db.update(refunds).set({ providerRefundId }).where(eq(refunds.id, refundId));
      },
    },

    webhooks: {
      async record(e) {
        const id = uuidv7();
        const inserted = await db
          .insert(webhookEvents)
          .values({
            id,
            provider: e.provider,
            dedupeKey: e.dedupeKey,
            eventType: e.eventType.slice(0, 64),
            reference: e.reference,
            payload: e.payload,
            receivedAt: e.at,
          })
          .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.dedupeKey] })
          .returning({ id: webhookEvents.id });
        if (inserted.length > 0) return { id, duplicate: false };
        const [existing] = await db
          .select({ id: webhookEvents.id })
          .from(webhookEvents)
          .where(
            and(eq(webhookEvents.provider, e.provider), eq(webhookEvents.dedupeKey, e.dedupeKey)),
          );
        return { id: existing?.id ?? id, duplicate: true };
      },

      async finish(id, status, error, at) {
        await db
          .update(webhookEvents)
          .set({
            processingStatus: status,
            error,
            processedAt: at,
            attempts: sql`${webhookEvents.attempts} + 1`,
          })
          .where(eq(webhookEvents.id, id));
      },
    },

    idempotency: {
      async begin(k) {
        const inserted = await db
          .insert(idempotencyKeys)
          .values({
            actorId: k.actorId,
            key: k.key,
            method: k.method,
            path: k.path,
            requestHash: k.requestHash,
            expiresAt: k.expiresAt,
          })
          .onConflictDoNothing({ target: [idempotencyKeys.actorId, idempotencyKeys.key] })
          .returning({ key: idempotencyKeys.key });
        if (inserted.length > 0) return { state: 'new' };
        const [row] = await db
          .select()
          .from(idempotencyKeys)
          .where(and(eq(idempotencyKeys.actorId, k.actorId), eq(idempotencyKeys.key, k.key)));
        if (!row) return { state: 'in_progress' };
        if (row.requestHash !== k.requestHash || row.method !== k.method || row.path !== k.path)
          return { state: 'mismatch' };
        if (row.status === 'IN_PROGRESS') return { state: 'in_progress' };
        return { state: 'replay', status: row.responseStatus ?? 200, body: row.responseBody };
      },

      async complete(actorId, key, status, body) {
        await db
          .update(idempotencyKeys)
          .set({ status: 'COMPLETED', responseStatus: status, responseBody: body })
          .where(and(eq(idempotencyKeys.actorId, actorId), eq(idempotencyKeys.key, key)));
      },

      async release(actorId, key) {
        await db
          .delete(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.actorId, actorId),
              eq(idempotencyKeys.key, key),
              eq(idempotencyKeys.status, 'IN_PROGRESS'),
            ),
          );
      },
    },
  };
}
