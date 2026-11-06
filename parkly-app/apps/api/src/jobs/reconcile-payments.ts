import type { Kobo } from '@parkly/domain/money';
import { reconcileTransactions, type ReconciliationRunStatus } from '@parkly/domain/reconciliation';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';
import type { Logger } from '../lib/logger.js';
import type { NotificationService } from '../notifications/service.js';
import type { PaymentProvider } from '../providers/index.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const LAGOS_DAY_MS = 24 * 60 * 60 * 1000;

export function reconcilePaymentsJob(deps: {
  store: Store;
  payments: PaymentProvider;
  logger: Logger;
  now: () => Date;
  notifications?: NotificationService;
}): JobHandler {
  const provider = deps.payments.name === 'paystack' ? 'PAYSTACK' : 'FAKE';

  return async ({ deadline: _deadline, payload }) => {
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
      // Defaults to yesterday in Lagos calendar date (07:00 WAT run reconciles previous day)
      const yesterday = new Date(now.getTime() - LAGOS_DAY_MS);
      businessDate = lagosDateKey(yesterday);
    }

    const from = lagosDayStart(businessDate);
    const to = new Date(from.getTime() + LAGOS_DAY_MS);
    const startedAt = deps.now();

    try {
      // 1. Fetch provider transactions for the Lagos calendar day
      const { items: providerTxs } = await deps.payments.listTransactions({ from, to });

      // 2. Fetch internal payments for the same provider and window
      const internalPayments = await deps.store.payments.forReconciliation({ provider, from, to });

      // 3. Map to domain types
      const internalRecords = internalPayments.map((p) => ({
        id: p.id,
        reference: p.id,
        amountKobo: p.amountKobo as Kobo,
        currency: 'NGN',
        status: p.status,
        paidAt: p.paidAt,
        operatorId: p.operatorId,
        bookingId: p.bookingId,
      }));

      const providerRecords = providerTxs.map((t) => ({
        reference: t.reference,
        amountKobo: t.amountKobo as Kobo,
        currency: t.currency,
        status: t.status,
        paidAt: t.paidAt,
        feesKobo: (t.feesKobo ?? undefined) as Kobo | undefined,
        channel: t.channel,
      }));

      // 4. Run pure reconciliation domain rules
      const output = reconcileTransactions({
        internal: internalRecords,
        provider: providerRecords,
      });

      // 5. Attempt auto-fix for PENDING internal payments that succeeded on provider
      for (const item of output.items) {
        if (item.result === 'STATUS_MISMATCH' && item.paymentId) {
          const internal = internalPayments.find((p) => p.id === item.paymentId);
          const prov = providerTxs.find((t) => t.reference === item.providerReference);
          const isProvSuccess =
            prov &&
            (prov.status.toLowerCase() === 'success' || prov.status.toLowerCase() === 'successful');
          if (
            internal &&
            internal.status === 'PENDING' &&
            isProvSuccess &&
            internal.amountKobo === prov.amountKobo
          ) {
            try {
              const settleAt = prov.paidAt ?? deps.now();
              const settleRes = await deps.store.payments.settle(
                internal.id,
                {
                  status: 'success',
                  amountKobo: prov.amountKobo,
                  currency: prov.currency,
                  paidAt: settleAt,
                  feesKobo: prov.feesKobo,
                  channel: prov.channel,
                  cardLast4: null,
                  cardBrand: null,
                },
                settleAt,
              );
              if (settleRes.decision === 'CONFIRM') {
                item.result = 'AUTO_FIXED';
                item.details = {
                  ...item.details,
                  reason: 'Auto-settled during reconciliation',
                };
                output.summary.autoFixedCount++;
                output.summary.statusMismatchCount--;
                output.summary.mismatchedCount--;
                output.summary.matchedCount++;
              }
            } catch (err) {
              deps.logger.error(
                { err, paymentId: internal.id },
                'failed to auto-settle payment during reconciliation',
              );
            }
          }
        }
      }

      // 6. Record reconciliation run
      const runStatus: ReconciliationRunStatus =
        output.summary.mismatchedCount > 0 ? 'COMPLETED_WITH_EXCEPTIONS' : 'COMPLETED';

      const savedRun = await deps.store.reconciliation.saveRun({
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
      });

      // 7. Record individual reconciliation items
      await deps.store.reconciliation.saveItems(
        savedRun.id,
        output.items.map((i) => ({
          paymentId: i.paymentId,
          providerReference: i.providerReference,
          result: i.result,
          details: i.details,
        })),
      );

      if (output.summary.mismatchedCount > 0) {
        deps.logger.warn(
          {
            event: 'reconciliation.exceptions',
            runId: savedRun.id,
            businessDate,
            mismatchedCount: output.summary.mismatchedCount,
          },
          'daily payment reconciliation completed with exceptions',
        );
      } else {
        deps.logger.info(
          {
            event: 'reconciliation.matched',
            runId: savedRun.id,
            businessDate,
            matchedCount: output.summary.matchedCount,
          },
          'daily payment reconciliation completed successfully',
        );
      }

      return { processed: output.items.length, remaining: 0 };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      deps.logger.error(
        {
          event: 'reconciliation.failed',
          businessDate,
          provider,
          error: errorMessage,
        },
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
