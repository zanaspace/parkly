import type { AppDeps } from '../../app.js';
import { bookingNotice } from '../../notifications/events.js';
import type { SettleResult } from '../../store/types.js';

/**
 * The one way a payment is settled (doc 02 §7.5): ask the provider (never
 * trust a webhook body or the app), apply the result under row locks, then
 * ask for any refund it calls for. Webhooks and the app's verify call both
 * come here; whichever is second finds nothing left to do.
 */
export async function verifyAndSettle(
  deps: Pick<AppDeps, 'store' | 'payments' | 'logger' | 'now' | 'notifications'>,
  paymentId: string,
): Promise<SettleResult | null> {
  const charge = await deps.payments.verify(paymentId);
  if (!charge) return null;
  const result = await deps.store.payments.settle(paymentId, charge, deps.now());
  const log = { event: 'payment.settled', paymentId, decision: result.decision };
  if (result.decision === 'AMOUNT_MISMATCH' || result.decision === 'NEEDS_REVIEW')
    deps.logger.error(log, 'payment needs finance review');
  else deps.logger.info(log, 'payment settled');

  if (result.refund) {
    // Refund failures are retried by finance from the refunds table (S5); never block the caller.
    try {
      const sent = await deps.payments.refund({
        reference: paymentId,
        amountKobo: result.refund.amountKobo,
      });
      await deps.store.payments.refundRequested(result.refund.id, sent.refundId);
    } catch (err) {
      deps.logger.error({ err, paymentId, refundId: result.refund.id }, 'refund request failed');
    }
  }
  await notifySettled(deps, result);
  return result;
}

/** FR-NOT-002: a confirmed booking or a paid extension. Settling twice queues once. */
async function notifySettled(deps: Pick<AppDeps, 'store' | 'notifications'>, result: SettleResult) {
  if (result.decision !== 'CONFIRM' && result.decision !== 'REACQUIRE_AND_CONFIRM') return;
  const notice = await bookingNotice(deps.store, result.booking);
  if (!notice) return;
  const { booking, base } = notice;
  if (result.payment.kind === 'EXTENSION')
    await deps.notifications.notify(
      { key: 'booking.extended', ...base, newEndAt: booking.endAt.toISOString() },
      // A booking can be extended more than once: one notice per payment.
      `booking.extended:${result.payment.id}`,
    );
  else if (result.payment.kind !== 'OVERSTAY')
    await deps.notifications.notify({
      key: 'booking.confirmed',
      ...base,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      totalKobo: booking.totalKobo,
    });
}
