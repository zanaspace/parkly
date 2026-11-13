import { Hono } from 'hono';
import type { AppDeps } from '../../app.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp } from '../../middleware/rate-limit.js';
import type { PaymentProvider } from '../../providers/index.js';
import { verifyAndSettle } from '../bookings/settle.js';

type PaystackEvent = {
  event?: unknown;
  data?: {
    id?: unknown;
    reference?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    channel?: unknown;
    paid_at?: unknown;
    /** Refund events: the charge the refund was made against. */
    transaction_reference?: unknown;
    transaction?: { reference?: unknown };
  };
};

type FlutterwaveEvent = {
  event?: unknown;
  data?: {
    id?: unknown;
    tx_ref?: unknown;
    reference?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    payment_type?: unknown;
    created_at?: unknown;
  };
};

/** Settles either a booking payment or a monthly pass payment by reference. */
export async function settlePaymentByReference(
  deps: Pick<AppDeps, 'store' | 'payments' | 'logger' | 'now' | 'notifications'> & {
    flutterwavePayments?: PaymentProvider;
  },
  reference: string,
  providerOverride?: PaymentProvider,
): Promise<'PROCESSED' | 'IGNORED'> {
  const payment = await deps.store.payments.find(reference);
  if (!payment) return 'IGNORED';
  const provider =
    providerOverride ??
    (payment.provider === 'FLUTTERWAVE' && deps.flutterwavePayments
      ? deps.flutterwavePayments
      : deps.payments);
  if (payment.kind === 'PASS' && payment.passId) {
    const charge = await provider.verify(reference);
    if (charge) await deps.store.passes.settle(payment.id, charge, deps.now());
    return 'PROCESSED';
  }
  await verifyAndSettle({ ...deps, payments: provider }, reference);
  return 'PROCESSED';
}

/** Refund events and the refund status each one means (gap review P-8). */
const REFUND_EVENTS: Record<string, 'SUCCEEDED' | 'FAILED'> = {
  'refund.processed': 'SUCCEEDED',
  'refund.failed': 'FAILED',
};

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);

/**
 * Paystack webhooks (doc 02 §6.9, §7). The signature is checked on the raw
 * body before anything is parsed. Each event is stored once (dedupe key) and
 * only the fields we need are kept: never the customer, card or authorization
 * code. The charge itself is re-checked with verify before anything changes.
 */
export function webhookRoutes(deps: AppDeps) {
  const app = new Hono();

  app.post('/webhooks/paystack', async (c) => {
    // Only Paystack's servers may call this (not checked when running locally).
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (deps.config.appEnv !== 'local' && !deps.config.paystackWebhookIps.includes(ip)) {
      deps.logger.warn(
        { event: 'webhook.ip_refused', provider: 'paystack' },
        'webhook from unknown IP',
      );
      throw new ApiError('FORBIDDEN');
    }
    const raw = await c.req.text();
    if (!deps.payments.verifyWebhook(raw, c.req.header('x-paystack-signature'))) {
      deps.logger.warn(
        { event: 'webhook.signature_invalid', provider: 'paystack' },
        'bad signature',
      );
      throw new ApiError('WEBHOOK_SIGNATURE_INVALID');
    }
    let body: PaystackEvent;
    try {
      body = JSON.parse(raw) as PaystackEvent;
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'Body is not JSON');
    }
    const eventType = str(body.event) ?? 'unknown';
    const refundOutcome = REFUND_EVENTS[eventType];
    const reference = refundOutcome
      ? (str(body.data?.transaction_reference) ?? str(body.data?.transaction?.reference))
      : str(body.data?.reference);
    const now = deps.now();
    const recorded = await deps.store.webhooks.record({
      provider: deps.payments.name === 'paystack' ? 'PAYSTACK' : 'FAKE',
      dedupeKey: `${eventType}:${reference ?? '-'}:${str(body.data?.id) ?? '-'}`.slice(0, 200),
      eventType,
      reference,
      payload: {
        event: eventType,
        data: {
          id: str(body.data?.id),
          reference,
          status: str(body.data?.status),
          amount: str(body.data?.amount),
          currency: str(body.data?.currency),
          channel: str(body.data?.channel),
          paid_at: str(body.data?.paid_at),
        },
      },
      at: now,
    });
    if (recorded.duplicate) return c.json({ received: true }, 200);

    if (refundOutcome && reference) {
      try {
        const matched = await deps.store.payments.refundOutcome({
          providerRefundId: str(body.data?.id),
          paymentId: reference,
          status: refundOutcome,
          at: now,
        });
        if (refundOutcome === 'FAILED' && matched)
          deps.logger.error(
            { paymentId: reference },
            'provider refused a refund; finance must follow up',
          );
        await deps.store.webhooks.finish(
          recorded.id,
          matched ? 'PROCESSED' : 'IGNORED',
          matched ? null : 'unknown refund',
          deps.now(),
        );
      } catch (err) {
        deps.logger.error({ err, webhookId: recorded.id }, 'refund webhook failed');
        await deps.store.webhooks.finish(recorded.id, 'FAILED', 'processing failed', deps.now());
      }
      return c.json({ received: true }, 200);
    }

    if (eventType !== 'charge.success' || !reference) {
      await deps.store.webhooks.finish(recorded.id, 'IGNORED', null, now);
      return c.json({ received: true }, 200);
    }
    // Processed inline for now; a row left PENDING or FAILED is retried by the retry-webhooks job.
    try {
      const outcome = await settlePaymentByReference(deps, reference, deps.payments);
      await deps.store.webhooks.finish(
        recorded.id,
        outcome,
        outcome === 'IGNORED' ? 'unknown reference' : null,
        deps.now(),
      );
    } catch (err) {
      deps.logger.error({ err, webhookId: recorded.id }, 'webhook processing failed');
      await deps.store.webhooks.finish(recorded.id, 'FAILED', 'processing failed', deps.now());
    }
    return c.json({ received: true }, 200);
  });

  // FR-PAY-007 (P1): Flutterwave webhook endpoint behind PaymentProvider.
  app.post('/webhooks/flutterwave', async (c) => {
    const flw = deps.flutterwavePayments ?? deps.payments;
    const raw = await c.req.text();
    const sig = c.req.header('verif-hash') ?? c.req.header('x-flutterwave-signature');
    if (!flw.verifyWebhook(raw, sig)) {
      deps.logger.warn(
        { event: 'webhook.signature_invalid', provider: 'flutterwave' },
        'bad flutterwave signature',
      );
      throw new ApiError('WEBHOOK_SIGNATURE_INVALID');
    }
    let body: FlutterwaveEvent;
    try {
      body = JSON.parse(raw) as FlutterwaveEvent;
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'Body is not JSON');
    }
    const eventType = str(body.event) ?? 'unknown';
    const reference = str(body.data?.tx_ref) ?? str(body.data?.reference);
    const now = deps.now();
    const recorded = await deps.store.webhooks.record({
      provider: 'FLUTTERWAVE',
      dedupeKey: `flw:${eventType}:${reference ?? '-'}:${str(body.data?.id) ?? '-'}`.slice(0, 200),
      eventType,
      reference,
      payload: {
        event: eventType,
        data: {
          id: str(body.data?.id),
          tx_ref: reference,
          status: str(body.data?.status),
          amount: str(body.data?.amount),
          currency: str(body.data?.currency),
          payment_type: str(body.data?.payment_type),
          created_at: str(body.data?.created_at),
        },
      },
      at: now,
    });
    if (recorded.duplicate) return c.json({ received: true }, 200);

    if ((eventType !== 'charge.completed' && eventType !== 'charge.success') || !reference) {
      await deps.store.webhooks.finish(recorded.id, 'IGNORED', null, now);
      return c.json({ received: true }, 200);
    }

    try {
      const outcome = await settlePaymentByReference(deps, reference, flw);
      await deps.store.webhooks.finish(
        recorded.id,
        outcome,
        outcome === 'IGNORED' ? 'unknown reference' : null,
        deps.now(),
      );
    } catch (err) {
      deps.logger.error({ err, webhookId: recorded.id }, 'flutterwave webhook processing failed');
      await deps.store.webhooks.finish(recorded.id, 'FAILED', 'processing failed', deps.now());
    }
    return c.json({ received: true }, 200);
  });

  return app;
}
