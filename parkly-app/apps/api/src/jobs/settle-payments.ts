import type { Logger } from '../lib/logger.js';
import { verifyAndSettle } from '../modules/bookings/settle.js';
import type { PaymentProvider } from '../providers/index.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const BATCH = 50;
const MAX_ATTEMPTS = 5;
const MINUTE_MS = 60_000;
/** Leave the inline webhook path a minute before retrying its event. */
const WEBHOOK_GRACE_MS = MINUTE_MS;
/**
 * Give a checkout two minutes before asking Paystack, and stop before
 * fn_expire_holds marks it ABANDONED at 30 (gap review P-9: the old 35 left a
 * window that could never match). Money that lands later is refunded.
 */
const CHECKOUT_FROM_MS = 30 * MINUTE_MS;
const CHECKOUT_TO_MS = 2 * MINUTE_MS;
/** A refund the provider refused or never answered is asked for again after this. */
const REFUND_RETRY_MS = 5 * MINUTE_MS;

/**
 * The payment safety net, every minute (doc 02 §7.6, §9):
 * 1. retries stored `charge.success` webhooks that failed or were never
 *    finished (up to 5 attempts; then they wait for ops);
 * 2. asks Paystack about checkouts still open after two minutes, so a booking
 *    is confirmed even if the webhook never arrives.
 * 3. asks again for refunds the provider never accepted (gap review P-8).
 * Steps 1–2 go through `verifyAndSettle`, which is a no-op when already settled.
 */
export function settlePaymentsJob(deps: {
  store: Store;
  payments: PaymentProvider;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  const { store } = deps;

  return async ({ deadline }) => {
    const start = deps.now();
    let processed = 0;
    let remaining = 0;

    const events = await store.webhooks.retryable({
      before: new Date(start.getTime() - WEBHOOK_GRACE_MS),
      maxAttempts: MAX_ATTEMPTS,
      limit: BATCH,
    });
    for (const [i, e] of events.entries()) {
      if (deps.now() >= deadline) {
        remaining += events.length - i;
        break;
      }
      try {
        const known = e.reference ? await store.payments.find(e.reference) : null;
        if (known && e.reference) await verifyAndSettle(deps, e.reference);
        await store.webhooks.finish(
          e.id,
          known ? 'PROCESSED' : 'IGNORED',
          known ? null : 'unknown reference',
          deps.now(),
        );
      } catch (err) {
        deps.logger.error({ err, webhookId: e.id }, 'webhook retry failed');
        await store.webhooks.finish(e.id, 'FAILED', 'processing failed', deps.now());
      }
      processed += 1;
    }

    const open = await store.payments.unsettled({
      from: new Date(start.getTime() - CHECKOUT_FROM_MS),
      to: new Date(start.getTime() - CHECKOUT_TO_MS),
      limit: BATCH,
    });
    for (const [i, id] of open.entries()) {
      if (deps.now() >= deadline) {
        remaining += open.length - i;
        break;
      }
      try {
        await verifyAndSettle(deps, id);
      } catch (err) {
        // Paystack down: the next run asks again.
        deps.logger.error({ err, paymentId: id }, 'payment check failed');
      }
      processed += 1;
    }

    const refunds = await store.payments.refundsToRetry({
      before: new Date(start.getTime() - REFUND_RETRY_MS),
      limit: BATCH,
    });
    for (const [i, r] of refunds.entries()) {
      if (deps.now() >= deadline) {
        remaining += refunds.length - i;
        break;
      }
      try {
        const sent = await deps.payments.refund({
          reference: r.paymentId,
          amountKobo: r.amountKobo,
        });
        await store.payments.refundRequested(r.id, sent.refundId);
      } catch (err) {
        deps.logger.error({ err, refundId: r.id }, 'refund retry failed');
      }
      processed += 1;
    }

    if (events.length === BATCH || open.length === BATCH || refunds.length === BATCH)
      remaining = Math.max(remaining, 1);
    return { processed, remaining };
  };
}
