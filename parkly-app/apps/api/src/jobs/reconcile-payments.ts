import type { Kobo } from '@parkly/domain/money';
import {
  reconcileTransactions,
  type InternalPaymentRecord,
  type ProviderTransactionRecord,
  type ReconciliationRunStatus,
} from '@parkly/domain/reconciliation';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';
import type { Logger } from '../lib/logger.js';
import { verifyAndSettle } from '../modules/bookings/settle.js';
import type { NotificationService } from '../notifications/service.js';
import type { PaymentProvider } from '../providers/index.js';
import type { PaymentRow, Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const LAGOS_DAY_MS = 24 * 60 * 60 * 1000;
/** Paystack's largest page; the job reads every page (review fix 1). */
const PER_PAGE = 100;
/** A runaway guard: 100 pages is 10,000 transactions in one day. */
const MAX_PAGES = 100;

const isProviderSuccess = (status: string) =>
  ['success', 'successful'].includes(status.toLowerCase());
const isInternalSuccess = (status: string) =>
  status === 'SUCCEEDED' || status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED';

const toInternal = (p: PaymentRow): InternalPaymentRecord => ({
  id: p.id,
  reference: p.id,
  amountKobo: p.amountKobo as Kobo,
  currency: 'NGN',
  status: p.status,
  paidAt: p.paidAt,
  operatorId: p.operatorId,
  bookingId: p.bookingId,
});

/**
 * S7 task 4, daily at 07:00 WAT: Paystack's transactions for one Lagos day
 * against our payments created that day (doc 02 §2.7).
 *
 * Review fixes (2026-11-06):
 * 1. reads every page of Paystack's list, not just the first 50;
 * 2. saves the run and its exceptions together, and a re-run keeps what
 *    finance already resolved;
 * 3. before calling a record missing, looks it up by reference on the other
 *    side, so a checkout started before midnight and paid after it isn't
 *    flagged on both days;
 * 4. a charge Paystack took that we never settled goes through
 *    verifyAndSettle, the one settle path (receipt, notice, late-money refund).
 */
export function reconcilePaymentsJob(deps: {
  store: Store;
  payments: PaymentProvider;
  logger: Logger;
  now: () => Date;
  notifications: NotificationService;
}): JobHandler {
  const provider = deps.payments.name === 'paystack' ? 'PAYSTACK' : 'FAKE';

  async function providerDay(from: Date, to: Date): Promise<ProviderTransactionRecord[]> {
    const all: ProviderTransactionRecord[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { items, total } = await deps.payments.listTransactions({
        from,
        to,
        page,
        perPage: PER_PAGE,
      });
      for (const t of items)
        all.push({
          reference: t.reference,
          amountKobo: t.amountKobo as Kobo,
          currency: t.currency,
          status: t.status,
          paidAt: t.paidAt,
          feesKobo: (t.feesKobo ?? undefined) as Kobo | undefined,
          channel: t.channel,
        });
      if (items.length === 0 || page * PER_PAGE >= total) return all;
    }
    throw new Error(`more than ${MAX_PAGES * PER_PAGE} provider transactions in one day`);
  }

  return async ({ payload }) => {
    const now = deps.now();
    let businessDate: string;

    if (
      payload &&
      typeof payload === 'object' &&
      'businessDate' in payload &&
      typeof (payload as { businessDate?: unknown }).businessDate === 'string'
    ) {
      const bDate = (payload as { businessDate: string }).businessDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bDate)) {
        throw new Error(`Invalid businessDate format: ${bDate}. Expected YYYY-MM-DD.`);
      }
      businessDate = bDate;
    } else {
      // The 07:00 WAT run reconciles the previous Lagos day.
      businessDate = lagosDateKey(new Date(now.getTime() - LAGOS_DAY_MS));
    }

    const from = lagosDayStart(businessDate);
    const to = new Date(from.getTime() + LAGOS_DAY_MS);
    const startedAt = deps.now();

    try {
      const providerRecords = await providerDay(from, to);
      const internalPayments = await deps.store.payments.forReconciliation({ provider, from, to });
      const internalRecords = internalPayments.map(toInternal);

      // Fix 3: a provider record we hold under another day is still ours.
      const ours = new Set(internalRecords.map((r) => r.reference));
      for (const t of providerRecords) {
        if (ours.has(t.reference)) continue;
        const p = await deps.store.payments.find(t.reference);
        if (p) {
          internalRecords.push(toInternal(p));
          ours.add(p.id);
        }
      }
      // ...and a settled payment of ours that Paystack listed under another day.
      const theirs = new Set(providerRecords.map((t) => t.reference));
      for (const r of internalRecords) {
        if (theirs.has(r.reference) || !isInternalSuccess(r.status)) continue;
        const charge = await deps.payments.verify(r.reference).catch(() => null);
        if (charge) {
          providerRecords.push({
            reference: r.reference,
            amountKobo: charge.amountKobo as Kobo,
            currency: charge.currency,
            status: charge.status,
            paidAt: charge.paidAt,
            feesKobo: (charge.feesKobo ?? undefined) as Kobo | undefined,
            channel: charge.channel,
          });
          theirs.add(r.reference);
        }
      }

      const output = reconcileTransactions({
        internal: internalRecords,
        provider: providerRecords,
      });

      // Fix 4: money Paystack took that we never settled goes through the one settle path.
      for (const item of output.items) {
        if (item.result !== 'STATUS_MISMATCH' || !item.paymentId) continue;
        const internal = internalRecords.find((p) => p.id === item.paymentId);
        const prov = providerRecords.find((t) => t.reference === item.providerReference);
        if (
          !internal ||
          !prov ||
          !isProviderSuccess(prov.status) ||
          isInternalSuccess(internal.status)
        )
          continue;
        try {
          const settled = await verifyAndSettle(
            {
              store: deps.store,
              payments: deps.payments,
              logger: deps.logger,
              now: deps.now,
              notifications: deps.notifications,
            },
            internal.id,
          );
          if (!settled) continue;
          const after = await deps.store.payments.find(internal.id);
          item.result = 'AUTO_FIXED';
          item.details = {
            ...item.details,
            internalStatus: after?.status ?? item.details.internalStatus ?? null,
            reason: `Settled during reconciliation: ${settled.decision}`,
          };
          output.summary.autoFixedCount++;
          output.summary.statusMismatchCount--;
          output.summary.mismatchedCount--;
          output.summary.matchedCount++;
        } catch (err) {
          deps.logger.error(
            { err, paymentId: internal.id },
            'failed to settle payment during reconciliation',
          );
        }
      }

      const runStatus: ReconciliationRunStatus =
        output.summary.mismatchedCount > 0 ? 'COMPLETED_WITH_EXCEPTIONS' : 'COMPLETED';

      // Fix 2: the run and its exceptions are saved together.
      const savedRun = await deps.store.reconciliation.recordRun(
        {
          businessDate,
          provider,
          status: runStatus,
          totalInternal: output.summary.totalInternal,
          totalProvider: output.summary.totalProvider,
          matchedCount: output.summary.matchedCount,
          mismatchedCount: output.summary.mismatchedCount,
          startedAt,
          finishedAt: deps.now(),
          error: null,
        },
        output.items.map((i) => ({
          paymentId: i.paymentId,
          providerReference: i.providerReference,
          result: i.result,
          details: i.details,
        })),
      );

      const log = {
        runId: savedRun.id,
        businessDate,
        matchedCount: output.summary.matchedCount,
        mismatchedCount: output.summary.mismatchedCount,
        autoFixedCount: output.summary.autoFixedCount,
      };
      if (output.summary.mismatchedCount > 0)
        deps.logger.warn(
          { event: 'reconciliation.exceptions', ...log },
          'daily payment reconciliation completed with exceptions',
        );
      else
        deps.logger.info(
          { event: 'reconciliation.matched', ...log },
          'daily payment reconciliation completed successfully',
        );

      return { processed: output.items.length, remaining: 0 };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      deps.logger.error(
        { event: 'reconciliation.failed', businessDate, provider, error: errorMessage },
        'daily payment reconciliation run failed',
      );
      await deps.store.reconciliation.saveRun({
        businessDate,
        provider,
        status: 'FAILED',
        totalInternal: 0,
        totalProvider: 0,
        matchedCount: 0,
        mismatchedCount: 0,
        startedAt,
        finishedAt: deps.now(),
        error: errorMessage,
      });
      throw err;
    }
  };
}
