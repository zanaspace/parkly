import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  RevealContactRequestSchema,
  RevealContactResponseSchema,
  SupportBookingDetailSchema,
  SupportSearchQuerySchema,
  SupportSearchResponseSchema,
} from '@parkly/contracts';
import {
  DEFAULT_REFUND_APPROVAL_THRESHOLD_KOBO,
  DEFAULT_SUPPORT_REFUND_LIMIT_KOBO,
  refundableKobo,
  staffRefundedKobo,
  supportRefundLeftKobo,
} from '@parkly/domain/booking';
import { buildTimeline, classifySupportQuery, maskedPhoneFromLast4 } from '@parkly/domain/support';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import type { SupportBookingRow } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const BookingIdParam = z.object({ id: z.uuid() });
const MAX_RESULTS = 20;

/** Masked: first name, "+234 *** *** 4567" and plate; never the full phone or email. */
function toSupportBooking(b: SupportBookingRow) {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    lotId: b.lotId,
    lotName: b.lotName,
    operatorName: b.operatorName,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    plate: b.plateNorm,
    totalKobo: b.totalKobo,
    driver: {
      firstName: b.driverFirstName,
      phoneMasked: maskedPhoneFromLast4(b.driverPhoneLast4),
      hasEmail: b.driverHasEmail,
    },
    createdAt: b.createdAt.toISOString(),
  };
}

/**
 * FR-ADM-002: support finds a booking from whatever the caller gives (code,
 * phone, plate, payment reference), reads its whole story, and sees the
 * driver's full phone or email only by revealing it with a reason (audited).
 */
export function adminSupportRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/support/search',
      tags: ['admin'],
      ...secured,
      request: { query: SupportSearchQuerySchema },
      responses: {
        200: { description: 'Matching bookings', ...json(SupportSearchResponseSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:support:read', {});
      const query = classifySupportQuery(c.req.valid('query').q);
      if (query.kind === 'INVALID') return c.json({ kind: query.kind, items: [] }, 200);
      const filter =
        query.kind === 'CODE'
          ? { code: query.code }
          : query.kind === 'REFERENCE'
            ? { paymentId: query.reference }
            : query.kind === 'PHONE'
              ? { phoneHash: deps.crypto.lookupHash(query.phone) }
              : { plateNorm: query.plateNorm, ...(query.alsoCode ? { code: query.alsoCode } : {}) };
      const rows = await deps.store.support.search(filter, MAX_RESULTS);
      // A phone search tells staff whose number it is, so it's recorded (without the number).
      if (query.kind === 'PHONE')
        await audit(c, deps, {
          action: 'support.phone_searched',
          entityType: 'booking',
          entityId: rows[0]?.id ?? null,
          after: { results: rows.length },
        });
      return c.json({ kind: query.kind, items: rows.map(toSupportBooking) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/bookings/{id}/support',
      tags: ['admin'],
      ...secured,
      request: { params: BookingIdParam },
      responses: {
        200: { description: 'Booking with its timeline', ...json(SupportBookingDetailSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:support:read', {});
      const { id } = c.req.valid('param');
      const booking = await deps.store.support.find(id);
      if (!booking) throw new ApiError('NOT_FOUND');
      const [history, payments, refunds, session, pending, threshold, supportLimit] =
        await Promise.all([
          deps.store.support.history(id),
          deps.store.payments.listForBooking(id),
          deps.store.payments.refundsForBooking(id),
          deps.store.attend.sessionByBooking(id),
          deps.store.refundRequests.list({ bookingId: id, status: 'PENDING_APPROVAL', limit: 50 }),
          deps.store.settings.get<number>('refund.approval_threshold_kobo'),
          deps.store.settings.get<number>('refund.support_limit_kobo'),
        ]);
      const refundable = refundableKobo({
        payments,
        refunds,
        pendingRequestsKobo: pending.reduce((n, r) => n + r.amountKobo, 0),
      });
      const timeline = buildTimeline({
        history,
        payments: payments.map((p) => ({
          kind: p.kind ?? 'BOOKING',
          status: p.status,
          amountKobo: p.amountKobo,
          createdAt: p.createdAt,
          paidAt: p.paidAt,
          failureCode: p.failureCode,
        })),
        refunds: refunds.map((r) => ({
          amountKobo: r.amountKobo,
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt ?? null,
        })),
        session,
      });
      return c.json(
        {
          booking: toSupportBooking(booking),
          overstay: session
            ? {
                status: session.overstayStatus,
                minutes: session.overstayMinutes,
                amountKobo: session.overstayAmountKobo,
              }
            : null,
          timeline: timeline.map((e) => ({ ...e, at: e.at ? e.at.toISOString() : null })),
          refundableKobo: refundable,
          refundApprovalThresholdKobo: threshold ?? DEFAULT_REFUND_APPROVAL_THRESHOLD_KOBO,
          supportRefundLeftKobo: supportRefundLeftKobo({
            limitKobo: supportLimit ?? DEFAULT_SUPPORT_REFUND_LIMIT_KOBO,
            staffRefundedKobo: staffRefundedKobo(refunds),
            refundableKobo: refundable,
          }),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/bookings/{id}/reveal',
      tags: ['admin'],
      ...secured,
      request: {
        params: BookingIdParam,
        body: { ...json(RevealContactRequestSchema), required: true },
      },
      responses: {
        200: { description: "The driver's phone or email", ...json(RevealContactResponseSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:contact:reveal', {});
      const { id } = c.req.valid('param');
      const { field, reason } = c.req.valid('json');
      const booking = await deps.store.support.find(id);
      if (!booking) throw new ApiError('NOT_FOUND');
      const contact = await deps.store.users.contact(booking.driverId);
      const enc = field === 'phone' ? contact?.phoneEnc : contact?.emailEnc;
      // Recorded before the value leaves, so a reveal is never missing from the log.
      await audit(c, deps, {
        action: 'booking.contact_revealed',
        entityType: 'booking',
        entityId: id,
        after: { field, reason, driverId: booking.driverId },
      });
      return c.json({ field, value: enc ? deps.crypto.decrypt(enc) : null }, 200);
    },
  );

  return app;
}
