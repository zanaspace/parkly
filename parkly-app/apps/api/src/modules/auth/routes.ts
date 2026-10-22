import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  BootstrapRequestSchema,
  BootstrapResponseSchema,
  OtpPrecheckRequestSchema,
  SessionRevokeRequestSchema,
} from '@parkly/contracts';
import { normaliseNigerianPhone } from '@parkly/domain/phone';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp, retryAfterSec } from '../../middleware/rate-limit.js';
import { buildMe } from '../me/me.js';
import {
  OTP_PHONE_RULES,
  OTP_PRECHECK_DEVICE,
  OTP_PRECHECK_IP,
  otpPhoneKey,
} from './otp-limits.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

export function authRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const auth = [authenticate(deps.verifyToken)];
  const authed = [authenticate(deps.verifyToken), loadActor(deps.store)];

  // UX only: lets the app show "wait N minutes" before calling Supabase. The
  // Send SMS Hook enforces the same per-phone limits authoritatively.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/otp/precheck',
      tags: ['auth'],
      request: { body: { ...json(OtpPrecheckRequestSchema), required: true } },
      responses: { 204: { description: 'OK to request a code' } },
    }),
    async (c) => {
      const { phone, deviceId } = c.req.valid('json');
      const e164 = normaliseNigerianPhone(phone);
      if (!e164) throw new ApiError('AUTH_PHONE_INVALID');
      const now = deps.now();

      const counted = await Promise.all([
        deps.rateLimiter.limit(`ip:${clientIp(c.req.header('x-forwarded-for'))}`, OTP_PRECHECK_IP),
        deps.rateLimiter.limit(`device:${deviceId}`, OTP_PRECHECK_DEVICE),
      ]);
      const peeked = await Promise.all(
        OTP_PHONE_RULES.map((r) => deps.rateLimiter.peek(otpPhoneKey(e164), r)),
      );
      const blocked = [...counted, ...peeked].filter((r) => !r.success);
      if (blocked.length > 0) {
        const reset = Math.max(...blocked.map((r) => r.reset));
        throw new ApiError('OTP_RATE_LIMITED', undefined, {
          headers: { 'retry-after': retryAfterSec(reset, now) },
        });
      }
      return c.body(null, 204);
    },
  );

  // First call after every sign-in: makes sure the profile exists, records the
  // device against this Supabase session and returns the profile.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/bootstrap',
      tags: ['auth'],
      security: [{ bearerAuth: [] }],
      middleware: auth,
      request: { body: { ...json(BootstrapRequestSchema), required: true } },
      responses: { 200: { description: 'Signed-in profile', ...json(BootstrapResponseSchema) } },
    }),
    async (c) => {
      const identity = c.get('identity');
      const body = c.req.valid('json');
      const { user, created } = await deps.store.users.ensure(identity.userId, {
        phoneLast4: identity.phone ? identity.phone.slice(-4) : null,
      });
      if (['LOCKED', 'SUSPENDED', 'DELETED'].includes(user.status))
        throw new ApiError('AUTH_ACCOUNT_LOCKED');

      await deps.store.users.setLookupHashes(user.id, {
        phoneHash: identity.phone ? deps.crypto.lookupHash(identity.phone) : null,
        emailHash: identity.email ? deps.crypto.lookupHash(identity.email) : null,
      });
      await deps.store.devices.upsert({
        userId: user.id,
        clientDeviceId: body.deviceId,
        platform: body.platform,
        appVersion: body.appVersion ?? null,
        authSessionId: identity.sessionId,
      });

      if (body.asDriver) await deps.store.users.addDriverRole(user.id);
      const roles = await deps.store.users.roles(user.id);
      const me = await buildMe(deps.store, user, roles);
      return c.json({ user: me, isNewUser: created || !me.profileComplete }, 200);
    },
  );

  // FR-AUTH-006: sign out this device or every device.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/sessions/revoke',
      tags: ['auth'],
      security: [{ bearerAuth: [] }],
      middleware: authed,
      request: { body: { ...json(SessionRevokeRequestSchema), required: true } },
      responses: { 204: { description: 'Signed out' } },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'session:revoke:own', { ownerUserId: actor.userId });
      const { scope } = c.req.valid('json');
      if (scope === 'all') await deps.store.devices.revokeAll(actor.userId);
      else await deps.store.devices.revokeBySession(actor.userId, c.get('identity').sessionId);
      await deps.sessions.signOut(c.get('accessToken'), scope === 'all' ? 'global' : 'local');
      return c.body(null, 204);
    },
  );

  return app;
}
