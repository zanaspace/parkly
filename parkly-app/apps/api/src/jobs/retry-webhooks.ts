import type { Logger } from '../lib/logger.js';
import { settlePaymentByReference } from '../modules/webhooks/routes.js';
import type { NotificationService } from '../notifications/service.js';
import type { PaymentProvider } from '../providers/index.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const BATCH = 50;

/**
 * S9 task 6 (carry-over from S4): retries PENDING or FAILED payment webhooks
 * (`charge.success` / `charge.completed`) by re-verifying the charge with the
 * provider and settling the payment.
 */
export function retryWebhooksJob(deps: {
  store: Store;
  payments: PaymentProvider;
  flutterwavePayments?: PaymentProvider;
  notifications: NotificationService;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  return async () => {
    const now = deps.now();
    const rows = await deps.store.webhooks.retryable({
      before: now,
      maxAttempts: 5,
      limit: BATCH,
    });
    let processed = 0;

    for (const row of rows) {
      if (!row.reference) {
        await deps.store.webhooks.finish(row.id, 'IGNORED', 'missing reference', now);
        continue;
      }
      try {
        const outcome = await settlePaymentByReference(deps, row.reference);
        await deps.store.webhooks.finish(
          row.id,
          outcome,
          outcome === 'IGNORED' ? 'unknown reference' : null,
          deps.now(),
        );
        processed += 1;
      } catch (err) {
        deps.logger.error({ err, webhookId: row.id, reference: row.reference }, 'webhook retry failed');
        await deps.store.webhooks.finish(row.id, 'FAILED', 'retry failed', deps.now());
      }
    }

    return {
      processed,
      remaining: rows.length === BATCH ? BATCH : 0,
    };
  };
}
