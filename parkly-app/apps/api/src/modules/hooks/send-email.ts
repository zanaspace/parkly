import { Hono } from 'hono';
import type { AppDeps } from '../../app.js';
import { verifyStandardWebhook } from '../../auth/standard-webhooks.js';
import {
  renderAuthEmails,
  SendEmailPayloadSchema,
  type SendEmailPayload,
} from '../../emails/auth-emails.js';
import { OTP_PHONE_RULES } from '../auth/otp-limits.js';

/** Supabase hooks read errors from this shape, not problem+json. */
const hookError = (status: 400 | 401 | 429 | 502 | 503, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Security notices don't count towards the code limits; codes and links do. */
const isNotice = (type: string) => type.endsWith('_notification');

/**
 * Supabase Send Email Hook (ADR 0022): with it on, Supabase sends no email of its
 * own. Every auth email (sign-in codes, password reset, signup confirmation,
 * invites, email change, security notices) comes here, is rendered in the Parkly
 * layout and goes out through our email provider (Resend). The payload holds
 * codes and link tokens, so nothing from it is logged except the action type.
 */
export function sendEmailHook(deps: AppDeps) {
  return new Hono().post('/supabase/send-email', async (c) => {
    const authEmail = deps.authEmail;
    if (!authEmail) return hookError(503, 'Email hook is not configured');

    const body = await c.req.text();
    const valid = verifyStandardWebhook({
      secret: authEmail.hookSecret,
      body,
      headers: {
        id: c.req.header('webhook-id'),
        timestamp: c.req.header('webhook-timestamp'),
        signature: c.req.header('webhook-signature'),
      },
      nowSec: Math.floor(deps.now().getTime() / 1000),
    });
    if (!valid) return hookError(401, 'invalid signature');

    let payload: SendEmailPayload;
    try {
      payload = SendEmailPayloadSchema.parse(JSON.parse(body));
    } catch {
      return hookError(400, 'invalid payload');
    }
    const type = payload.email_data.email_action_type;

    const messages = renderAuthEmails(payload, authEmail.supabaseUrl);
    if (!messages) {
      deps.logger.warn({ event: 'auth_email.unknown_type', type }, 'auth email type not handled');
      return hookError(400, 'Unsupported email type');
    }
    if (messages.some((m) => !m.to.includes('@'))) return hookError(400, 'No email address');

    // The same per-recipient limits as SMS codes (doc 05 §4.1), keyed on a hash
    // so no address sits in Redis.
    if (!isNotice(type)) {
      for (const m of messages) {
        const key = `email:${deps.crypto.lookupHash(m.to.toLowerCase()).toString('hex')}`;
        for (const rule of OTP_PHONE_RULES) {
          const { success } = await deps.rateLimiter.limit(key, {
            ...rule,
            name: rule.name.replace('phone', 'email'),
          });
          if (!success) {
            deps.logger.warn(
              { event: 'auth_email.rate_limited', type, rule: rule.name },
              'auth email blocked',
            );
            return hookError(
              429,
              'Too many emails requested. Please wait a few minutes and try again.',
            );
          }
        }
      }
    }

    try {
      for (const m of messages) await authEmail.provider.send(m);
    } catch (err) {
      deps.logger.error(
        {
          event: 'auth_email.send_failed',
          type,
          error: err instanceof Error ? err.message : 'unknown',
        },
        'auth email failed',
      );
      return hookError(502, 'Email provider unavailable');
    }
    deps.logger.info({ event: 'auth_email.sent', type, count: messages.length }, 'auth email sent');
    return c.json({}, 200);
  });
}
