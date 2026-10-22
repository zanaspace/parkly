import { Hono } from 'hono';
import type { AppDeps } from '../../app.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp } from '../../middleware/rate-limit.js';
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
  };
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
    const reference = str(body.data?.reference);
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

    if (eventType !== 'charge.success' || !reference) {
      await deps.store.webhooks.finish(recorded.id, 'IGNORED', null, now);
      return c.json({ received: true }, 200);
    }
    // Processed inline for now; a row left PENDING is retried by the S4 webhook job.
    try {
      const payment = await deps.store.payments.find(reference);
      if (!payment) {
        await deps.store.webhooks.finish(recorded.id, 'IGNORED', 'unknown reference', deps.now());
      } else {
        await verifyAndSettle(deps, reference);
        await deps.store.webhooks.finish(recorded.id, 'PROCESSED', null, deps.now());
      }
    } catch (err) {
      deps.logger.error({ err, webhookId: recorded.id }, 'webhook processing failed');
      await deps.store.webhooks.finish(recorded.id, 'FAILED', 'processing failed', deps.now());
    }
    return c.json({ received: true }, 200);
  });

  return app;
}
