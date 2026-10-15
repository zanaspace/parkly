import { normaliseNigerianPhone, maskPhone } from '@parkly/domain/phone';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppDeps } from '../../app.js';
import { verifyStandardWebhook } from '../../auth/standard-webhooks.js';
import { OTP_PHONE_RULES, otpPhoneKey } from '../auth/otp-limits.js';

const PayloadSchema = z.object({
  user: z.object({ phone: z.string().min(5) }),
  sms: z.object({ otp: z.string().regex(/^\d{4,10}$/) }),
});

/** Supabase hooks read errors from this shape, not problem+json. */
const hookError = (status: 400 | 401 | 429 | 502, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const otpMessage = (otp: string) =>
  `Your Parkly code is ${otp}. It expires in 5 minutes. Never share it.`;

/**
 * Supabase Send SMS Hook (doc 05 §4.1): the single choke point for every OTP
 * SMS. Verifies the hook signature, applies per-phone limits, only sends to
 * Nigerian mobiles, and falls back to the secondary provider. The payload holds
 * the OTP, so nothing from it is ever logged except a masked phone.
 */
export function sendSmsHook(deps: AppDeps) {
  return new Hono().post('/supabase/send-sms', async (c) => {
    const body = await c.req.text();
    const valid = verifyStandardWebhook({
      secret: deps.config.smsHookSecret,
      body,
      headers: {
        id: c.req.header('webhook-id'),
        timestamp: c.req.header('webhook-timestamp'),
        signature: c.req.header('webhook-signature'),
      },
      nowSec: Math.floor(deps.now().getTime() / 1000),
    });
    if (!valid) return hookError(401, 'invalid signature');

    let payload: z.infer<typeof PayloadSchema>;
    try {
      payload = PayloadSchema.parse(JSON.parse(body));
    } catch {
      return hookError(400, 'invalid payload');
    }

    const phone = normaliseNigerianPhone(
      payload.user.phone.startsWith('+') ? payload.user.phone : `+${payload.user.phone}`,
    );
    if (!phone) return hookError(400, 'Only Nigerian mobile numbers are supported');

    for (const rule of OTP_PHONE_RULES) {
      const { success } = await deps.rateLimiter.limit(otpPhoneKey(phone), rule);
      if (!success) {
        deps.logger.warn(
          { event: 'otp.rate_limited', phone: maskPhone(phone), rule: rule.name },
          'otp blocked',
        );
        return hookError(429, 'Too many codes requested. Please wait and try again.');
      }
    }

    const message = { to: phone, body: otpMessage(payload.sms.otp), kind: 'OTP' as const };
    for (const provider of [deps.sms.primary, deps.sms.secondary]) {
      if (!provider) continue;
      try {
        await provider.send(message);
        deps.logger.info(
          { event: 'otp.sent', phone: maskPhone(phone), provider: provider.name },
          'otp sent',
        );
        return c.json({}, 200);
      } catch (err) {
        deps.logger.error(
          {
            event: 'otp.send_failed',
            provider: provider.name,
            error: err instanceof Error ? err.message : 'unknown',
          },
          'sms provider failed',
        );
      }
    }
    return hookError(502, 'SMS provider unavailable');
  });
}
