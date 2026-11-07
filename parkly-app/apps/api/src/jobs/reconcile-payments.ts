import type { Kobo } from '@parkly/domain/money';
import {
  ledgerExceptions,
  reconcileTransactions,
  type InternalPaymentRecord,
  type ProviderTransactionRecord,
  type ReconciliationRunStatus,
} from '@parkly/domain/reconciliation';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';
import { brandedEmail, detailsCard, esc, paragraph } from '../emails/layout.js';
import type { Logger } from '../lib/logger.js';
import { verifyAndSettle } from '../modules/bookings/settle.js';
import type { NotificationService } from '../notifications/service.js';
import type { EmailProvider, PaymentProvider } from '../providers/index.js';
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
/** Settle decisions that leave a charge confirmed or handed back, so the item is fixed. */
const FIXED_BY: ReadonlySet<string> = new Set([
  'CONFIRM',
  'REACQUIRE_AND_CONFIRM',
  'REFUND_HOLD_EXPIRED',
  'REFUND_CANCELLED',
  'REFUND_NOT_APPLIED',
  'REFUND_WRONG_AMOUNT',
  'NEEDS_REVIEW',
]);

export function reconcilePaymentsJob(deps: {
  store: Store;
  payments: PaymentProvider;
  logger: Logger;
  now: () => Date;
  notifications: NotificationService;
  /** Review item 8: the exceptions summary goes here when set. */
  email?: EmailProvider;
  financeAlertEmail?: string | null;
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

      const statusAfterFix = new Map<string, string>();
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
          // Only a settle that confirmed or refunded the money fixes it; a wrong amount
          // held for finance, or a no-op, stays open (gap review P-9).
          if (!settled || !FIXED_BY.has(settled.decision)) continue;
          const after = await deps.store.payments.find(internal.id);
          if (after) statusAfterFix.set(after.id, after.status);
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

      // Item 7a: every settled payment has a journal that took in exactly its amount.
      const settledNow = internalRecords.map((r) => ({
        id: r.id,
        status: statusAfterFix.get(r.id) ?? r.status,
        amountKobo: r.amountKobo,
      }));
      const debits = await deps.store.reconciliation.clearingDebits(
        provider,
        settledNow.map((p) => p.id),
      );
      const ledgerItems = ledgerExceptions({
        payments: settledNow,
        clearingDebits: debits as Map<string, Kobo>,
      });
      // Item 7c: provider payouts still held for review (S7 task 3).
      const heldPayouts = await deps.store.settlements.needingReview(200);
      const payoutItems = heldPayouts.map((st) => ({
        paymentId: null,
        providerReference: `settlement:${st.providerSettlementId}`,
        result: 'SETTLEMENT_REVIEW' as const,
        details: {
          providerAmountKobo: (st.amountKobo ?? null) as Kobo | null,
          reason: st.reviewReason ?? 'Payout held for review',
        },
      }));
      output.items.push(...ledgerItems, ...payoutItems);
      output.summary.mismatchedCount += ledgerItems.length + payoutItems.length;

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

      if (output.summary.mismatchedCount > 0 && deps.email && deps.financeAlertEmail) {
        const counts = new Map<string, number>();
        for (const i of output.items)
          if (i.result !== 'MATCHED' && i.result !== 'AUTO_FIXED')
            counts.set(i.result, (counts.get(i.result) ?? 0) + 1);
        const subject = `Parkly reconciliation ${businessDate}: ${output.summary.mismatchedCount} to review`;
        const lines = [...counts.entries()].sort();
        try {
          await deps.email.send({
            to: deps.financeAlertEmail,
            subject,
            html: brandedEmail({
              title: subject,
              preheader: subject,
              heading: `${output.summary.mismatchedCount} reconciliation exceptions`,
              body: [
                paragraph(
                  `The daily reconciliation for <strong>${esc(businessDate)}</strong> (${esc(provider)}) found exceptions to review.`,
                ),
                detailsCard(lines.map(([k, n]) => [k.replace(/_/g, ' ').toLowerCase(), String(n)])),
                paragraph(
                  'Open the admin console, Finance, Reconciliation, to review and resolve them.',
                ),
              ].join(''),
            }),
            text: `${subject}\n\n${lines.map(([k, n]) => `${k}: ${n}`).join('\n')}\n\nReview them in the admin console under Finance, Reconciliation.`,
          });
        } catch (err) {
          deps.logger.error(
            { err, runId: savedRun.id, event: 'reconciliation.alert_failed' },
            'reconciliation alert email failed',
          );
        }
      }

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
