import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AdminCancelRequestSchema,
  AdminCancelResponseSchema,
  AdminRefundRequestSchema,
  AdminRefundResponseSchema,
  ApproveRefundRequestSchema,
  RefundRequestListQuerySchema,
  RefundRequestListSchema,
  RefundRequestSchema,
  RejectRefundRequestSchema,
} from '@parkly/contracts';
import {
  cancellationPolicy,
  DEFAULT_REFUND_APPROVAL_THRESHOLD_KOBO,
  needsSecondApproval,
  refundableKobo,
  splitAdminRefund,
} from '@parkly/domain/booking';
import type { Kobo } from '@parkly/domain/money';
import type { Context } from 'hono';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { idempotent } from '../../lib/idempotency.js';
import { bookingNotice } from '../../notifications/events.js';
import {
  BookingHoldError,
  RefundExceedsError,
  type RefundRequestRow,
  type RefundRow,
} from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const IdParam = z.object({ id: z.uuid() });
const IdempotencyHeader = z.object({ 'idempotency-key': z.string().optional() });

/**
 * FR-ADM-003: what support and finance can do to a booking, each with a
 * reason in the audit log.
 * - Cancel (support, ops, finance): the same policy as the driver's own cancel.
 * - Refund (finance): an amount staff choose, up to what's left. Over
 *   `refund.approval_threshold_kobo` (₦50,000) it waits for a second finance
 *   admin, who can't be the one who asked (maker-checker, doc 05 §5.1).
 * - Resend the ticket (support, ops, finance).
 */
export function adminBookingActionRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  /** Once per Idempotency-Key (AGENTS.md §5): a double click gets the first answer back. */
  async function once<R extends Response>(
    c: Context<AuthEnv>,
    path: string,
    run: () => Promise<R>,
  ): Promise<R> {
    const result = await idempotent<unknown>(
      deps.store,
      {
        actorId: c.get('actor').userId,
        key: c.req.header('idempotency-key'),
        method: 'POST',
        path,
        body: await c.req.json().catch(() => null),
        now: deps.now(),
      },
      async () => {
        const res = await run();
        return { status: res.status, body: await res.json() };
      },
    );
    if (result.replayed) c.header('idempotent-replayed', 'true');
    return c.json(result.body, result.status as 200) as unknown as R;
  }

  /** Asks the provider for each refund part; failures are retried by retry-refunds. */
  async function sendRefunds(
    bookingId: string,
    parts: { id: string; paymentId: string; amountKobo: number }[],
  ) {
    for (const r of parts) {
      try {
        const sent = await deps.payments.refund({
          reference: r.paymentId,
          amountKobo: r.amountKobo,
        });
        await deps.store.payments.refundRequested(r.id, sent.refundId);
      } catch (err) {
        deps.logger.error({ err, bookingId, refundId: r.id }, 'staff refund request failed');
      }
    }
  }

  async function threshold(): Promise<number> {
    return (
      (await deps.store.settings.get<number>('refund.approval_threshold_kobo')) ??
      DEFAULT_REFUND_APPROVAL_THRESHOLD_KOBO
    );
  }

  /** Issues a staff refund now: refund rows, reversal journal, provider, driver notice. */
  async function issueRefund(
    bookingId: string,
    input: {
      amountKobo: number;
      reason: RefundRow['reason'];
      note: string;
      actorId: string;
      approvedBy: string | null;
    },
  ) {
    const booking = await deps.store.bookings.find(bookingId);
    if (!booking) throw new ApiError('NOT_FOUND');
    const split = splitAdminRefund(input.amountKobo as Kobo, booking);
    let parts: { id: string; paymentId: string; amountKobo: number }[];
    try {
      parts = await deps.store.payments.refundBooking(
        bookingId,
        {
          amountKobo: input.amountKobo,
          reason: input.reason,
          ...split,
          note: input.note,
          approvedBy: input.approvedBy,
        },
        input.actorId,
        deps.now(),
      );
    } catch (err) {
      if (err instanceof RefundExceedsError)
        throw new ApiError('REFUND_EXCEEDS_REFUNDABLE', 'There is not that much left to refund');
      throw err;
    }
    await sendRefunds(bookingId, parts);
    const notice = await bookingNotice(deps.store, booking);
    if (notice)
      await deps.notifications.notify(
        { key: 'booking.refunded', ...notice.base, refundKobo: input.amountKobo },
        `booking.refunded:${bookingId}:${parts[0]?.id ?? 'none'}`,
      );
  }

  async function serializeRequest(r: RefundRequestRow) {
    const [booking, requester] = await Promise.all([
      deps.store.bookings.find(r.bookingId),
      deps.store.users.find(r.requestedBy),
    ]);
    return {
      id: r.id,
      bookingId: r.bookingId,
      bookingCode: booking?.code ?? '',
      amountKobo: r.amountKobo,
      reason: r.reason,
      note: r.note,
      status: r.status,
      requestedBy: r.requestedBy,
      requestedByName: requester?.firstName ?? null,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt.toISOString(),
    };
  }

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/bookings/{id}/cancel',
      tags: ['admin'],
      ...secured,
      request: {
        params: IdParam,
        headers: IdempotencyHeader,
        body: { ...json(AdminCancelRequestSchema), required: true },
      },
      responses: { 200: { description: 'Cancelled', ...json(AdminCancelResponseSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:admin:cancel', {});
      const { id } = c.req.valid('param');
      return once(c, `/v1/admin/bookings/${id}/cancel`, async () => {
        const { reason } = c.req.valid('json');
        const booking = await deps.store.bookings.find(id);
        if (!booking) throw new ApiError('NOT_FOUND');
        const now = deps.now();
        const freeLeadMin =
          (await deps.store.settings.get<number>('booking.free_cancel_before_start_min')) ?? 30;
        // Staff follow the driver's policy; a bigger refund is a separate, chosen refund.
        const policy = cancellationPolicy({
          startAt: booking.startAt,
          now,
          status: booking.status,
          priceKobo: booking.priceKobo,
          serviceFeeKobo: booking.serviceFeeKobo,
          totalKobo: booking.totalKobo,
          actor: 'DRIVER',
          settings: { freeCancellationLeadMin: freeLeadMin },
        });
        if (!policy.cancellable)
          throw new ApiError('BOOKING_NOT_CANCELLABLE', 'This booking cannot be cancelled');
        const actorId = c.get('actor').userId;
        let cancelled: Awaited<ReturnType<typeof deps.store.bookings.cancel>>;
        try {
          cancelled = await deps.store.bookings.cancel(
            id,
            'ADMIN',
            actorId,
            reason,
            policy.refundKobo > 0
              ? {
                  amountKobo: policy.refundKobo,
                  reason: policy.reason,
                  refundPriceKobo: policy.refundPriceKobo,
                  refundServiceFeeKobo: policy.refundServiceFeeKobo,
                }
              : null,
            now,
          );
        } catch (err) {
          if (err instanceof BookingHoldError) throw new ApiError(err.code);
          throw err;
        }
        await sendRefunds(id, cancelled.refunds);
        await audit(c, deps, {
          action: 'booking.cancelled_by_staff',
          entityType: 'booking',
          entityId: id,
          before: { status: booking.status },
          after: { status: cancelled.booking.status, reason, refundKobo: policy.refundKobo },
        });
        const notice = await bookingNotice(deps.store, cancelled.booking);
        if (notice)
          await deps.notifications.notify({
            key: 'booking.cancelled',
            ...notice.base,
            refundKobo: policy.refundKobo,
          });
        return c.json({ status: cancelled.booking.status, refundKobo: policy.refundKobo }, 200);
      });
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/bookings/{id}/refunds',
      tags: ['admin'],
      ...secured,
      request: {
        params: IdParam,
        headers: IdempotencyHeader,
        body: { ...json(AdminRefundRequestSchema), required: true },
      },
      responses: {
        200: { description: 'Issued, or waiting for approval', ...json(AdminRefundResponseSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:refund', {});
      const { id } = c.req.valid('param');
      return once(c, `/v1/admin/bookings/${id}/refunds`, async () => {
        const { amountKobo, reason, note } = c.req.valid('json');
        const booking = await deps.store.bookings.find(id);
        if (!booking) throw new ApiError('NOT_FOUND');
        const [payments, refunds, pending] = await Promise.all([
          deps.store.payments.listForBooking(id),
          deps.store.payments.refundsForBooking(id),
          deps.store.refundRequests.list({ bookingId: id, status: 'PENDING_APPROVAL', limit: 50 }),
        ]);
        const left = refundableKobo({
          payments,
          refunds,
          pendingRequestsKobo: pending.reduce((n, r) => n + r.amountKobo, 0),
        });
        if (amountKobo > left)
          throw new ApiError(
            'REFUND_EXCEEDS_REFUNDABLE',
            `At most ₦${(left / 100).toFixed(2)} is left to refund on this booking`,
          );
        const actorId = c.get('actor').userId;

        if (needsSecondApproval(amountKobo, await threshold())) {
          const request = await deps.store.refundRequests.create(
            { bookingId: id, amountKobo, reason, note, requestedBy: actorId },
            deps.now(),
          );
          await audit(c, deps, {
            action: 'refund.approval_requested',
            entityType: 'booking',
            entityId: id,
            after: { requestId: request.id, amountKobo, reason, note },
          });
          return c.json(
            { outcome: 'PENDING_APPROVAL' as const, request: await serializeRequest(request) },
            200,
          );
        }

        await issueRefund(id, { amountKobo, reason, note, actorId, approvedBy: null });
        await audit(c, deps, {
          action: 'refund.issued',
          entityType: 'booking',
          entityId: id,
          after: { amountKobo, reason, note },
        });
        return c.json({ outcome: 'ISSUED' as const, amountKobo }, 200);
      });
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/refund-requests',
      tags: ['admin'],
      ...secured,
      request: { query: RefundRequestListQuerySchema },
      responses: { 200: { description: 'Refund requests', ...json(RefundRequestListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:refund', {});
      const { status, bookingId } = c.req.valid('query');
      const rows = await deps.store.refundRequests.list({ status, bookingId, limit: 100 });
      return c.json({ items: await Promise.all(rows.map(serializeRequest)) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/refund-requests/{id}/approve',
      tags: ['admin'],
      ...secured,
      request: {
        params: IdParam,
        headers: IdempotencyHeader,
        body: { ...json(ApproveRefundRequestSchema), required: true },
      },
      responses: { 200: { description: 'Approved and issued', ...json(RefundRequestSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:refund', {});
      const { id } = c.req.valid('param');
      return once(c, `/v1/admin/refund-requests/${id}/approve`, async () => {
        const { note } = c.req.valid('json');
        const actorId = c.get('actor').userId;
        const request = await deps.store.refundRequests.find(id);
        if (!request) throw new ApiError('NOT_FOUND');
        if (request.requestedBy === actorId)
          throw new ApiError('FOUR_EYES_REQUIRED', 'Another finance admin has to approve this');
        if (request.status !== 'PENDING_APPROVAL')
          throw new ApiError('INVALID_STATE_TRANSITION', 'This request was already decided');
        const decided = await deps.store.refundRequests.decide(
          id,
          { status: 'APPROVED', decidedBy: actorId, note: note || null },
          deps.now(),
        );
        if (!decided)
          throw new ApiError('INVALID_STATE_TRANSITION', 'This request was already decided');
        try {
          await issueRefund(request.bookingId, {
            amountKobo: request.amountKobo,
            reason: request.reason,
            note: request.note,
            actorId: request.requestedBy,
            approvedBy: actorId,
          });
        } catch (err) {
          if (err instanceof ApiError && err.code === 'REFUND_EXCEEDS_REFUNDABLE') {
            await deps.store.refundRequests.fail(id, deps.now());
            await audit(c, deps, {
              action: 'refund.approval_failed',
              entityType: 'booking',
              entityId: request.bookingId,
              after: { requestId: id, amountKobo: request.amountKobo },
            });
          }
          throw err;
        }
        await audit(c, deps, {
          action: 'refund.approved',
          entityType: 'booking',
          entityId: request.bookingId,
          after: { requestId: id, amountKobo: request.amountKobo, note: note || null },
        });
        return c.json(await serializeRequest(decided), 200);
      });
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/refund-requests/{id}/reject',
      tags: ['admin'],
      ...secured,
      request: {
        params: IdParam,
        body: { ...json(RejectRefundRequestSchema), required: true },
      },
      responses: { 200: { description: 'Rejected', ...json(RefundRequestSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:refund', {});
      const { id } = c.req.valid('param');
      const { note } = c.req.valid('json');
      const actorId = c.get('actor').userId;
      const request = await deps.store.refundRequests.find(id);
      if (!request) throw new ApiError('NOT_FOUND');
      if (request.requestedBy === actorId)
        throw new ApiError('FOUR_EYES_REQUIRED', 'Another finance admin has to decide this');
      const decided = await deps.store.refundRequests.decide(
        id,
        { status: 'REJECTED', decidedBy: actorId, note },
        deps.now(),
      );
      if (!decided)
        throw new ApiError('INVALID_STATE_TRANSITION', 'This request was already decided');
      await audit(c, deps, {
        action: 'refund.rejected',
        entityType: 'booking',
        entityId: request.bookingId,
        after: { requestId: id, amountKobo: request.amountKobo, note },
      });
      return c.json(await serializeRequest(decided), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/bookings/{id}/resend-ticket',
      tags: ['admin'],
      ...secured,
      request: { params: IdParam },
      responses: { 204: { description: 'Queued' } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:ticket:resend', {});
      const { id } = c.req.valid('param');
      const booking = await deps.store.bookings.find(id);
      if (!booking) throw new ApiError('NOT_FOUND');
      if (booking.status !== 'CONFIRMED' && booking.status !== 'CHECKED_IN')
        throw new ApiError('INVALID_STATE_TRANSITION', 'Only a paid booking has a ticket to send');
      const notice = await bookingNotice(deps.store, booking);
      if (!notice) throw new ApiError('NOT_FOUND');
      // One resend a minute per booking, so a double click doesn't text twice.
      const minute = Math.floor(deps.now().getTime() / 60_000);
      await deps.notifications.notify(
        {
          key: 'booking.confirmed',
          ...notice.base,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
          totalKobo: booking.totalKobo,
        },
        `booking.confirmed:${id}:resend:${minute}`,
      );
      await audit(c, deps, {
        action: 'booking.ticket_resent',
        entityType: 'booking',
        entityId: id,
      });
      return c.body(null, 204);
    },
  );

  return app;
}
