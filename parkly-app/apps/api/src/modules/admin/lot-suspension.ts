import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CancelUpcomingRequestSchema,
  CancelUpcomingResponseSchema,
  LotSuspensionImpactSchema,
} from '@parkly/contracts';
import { cancellationPolicy } from '@parkly/domain/booking';
import type { Kobo } from '@parkly/domain/money';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { bookingNotice } from '../../notifications/events.js';
import { BookingHoldError, type BookingRow } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const LotIdParam = z.object({ lotId: z.uuid() });

/** Most bookings one request cancels, so it finishes inside the function time limit. */
const BATCH = 100;

/**
 * Doc 03 §4.3, FR-LOT-006: what a suspension does to drivers who booked.
 * - Impact: who has paid and not yet arrived, who is parked now, unpaid holds.
 * - Cancel upcoming: for a SUSPENDED car park, cancel those bookings with a full
 *   refund and tell each driver. Cars already parked and unpaid holds are left alone.
 * Suspending itself is `POST /admin/lots/{lotId}/status`; existing bookings are
 * honoured unless ops chooses to cancel them here.
 */
export function adminLotSuspensionRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  async function mustLot(lotId: string) {
    const lot = await deps.store.lots.findById(lotId);
    if (!lot) throw new ApiError('NOT_FOUND');
    return lot;
  }

  const paidUpcoming = (rows: BookingRow[]) => rows.filter((b) => b.status === 'CONFIRMED');

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/lots/{lotId}/suspension-impact',
      tags: ['admin'],
      ...secured,
      request: { params: LotIdParam },
      responses: { 200: { description: 'Impact', ...json(LotSuspensionImpactSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:review', {});
      const lot = await mustLot(c.req.valid('param').lotId);
      const rows = await deps.store.bookings.listUpcomingForLot(lot.id, deps.now());
      const upcoming = paidUpcoming(rows);
      const items = await Promise.all(
        upcoming.map(async (b) => ({
          id: b.id,
          code: b.code,
          startAt: b.startAt.toISOString(),
          endAt: b.endAt.toISOString(),
          totalKobo: b.totalKobo,
          driverFirstName: (await deps.store.users.find(b.driverId))?.firstName ?? null,
        })),
      );
      return c.json(
        {
          lotId: lot.id,
          lotName: lot.name,
          upcoming: items,
          activeCount: rows.filter((b) => b.status === 'CHECKED_IN').length,
          holdCount: rows.filter((b) => b.status === 'PENDING_PAYMENT').length,
          totalRefundKobo: upcoming.reduce((sum, b) => sum + b.totalKobo, 0),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/lots/{lotId}/cancel-upcoming-bookings',
      tags: ['admin'],
      ...secured,
      request: {
        params: LotIdParam,
        body: { ...json(CancelUpcomingRequestSchema), required: true },
      },
      responses: { 200: { description: 'Cancelled', ...json(CancelUpcomingResponseSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:suspension:cancel-bookings', {});
      const lot = await mustLot(c.req.valid('param').lotId);
      const { reason } = c.req.valid('json');
      // Only for a car park that is already suspended: this is the second step of doc 03 §4.3.
      if (lot.status !== 'SUSPENDED')
        throw new ApiError('INVALID_STATE_TRANSITION', 'Suspend the car park first');

      const now = deps.now();
      const actorId = c.get('actor').userId;
      const batch = paidUpcoming(await deps.store.bookings.listUpcomingForLot(lot.id, now)).slice(
        0,
        BATCH,
      );
      const freeLeadMin =
        (await deps.store.settings.get<number>('booking.free_cancel_before_start_min')) ?? 30;

      let cancelled = 0;
      let refundedKobo = 0;
      const failed: { code: string; message: string }[] = [];
      for (const booking of batch) {
        try {
          // The car park's fault, so a full refund however close to the start it is.
          const policy = cancellationPolicy({
            startAt: booking.startAt,
            now,
            status: booking.status,
            priceKobo: booking.priceKobo as Kobo,
            serviceFeeKobo: booking.serviceFeeKobo as Kobo,
            totalKobo: booking.totalKobo as Kobo,
            actor: 'ADMIN',
            overrideRefundKobo: booking.totalKobo as Kobo,
            overrideReason: 'LOT_UNAVAILABLE',
            settings: { freeCancellationLeadMin: freeLeadMin },
          });
          if (!policy.cancellable) throw new ApiError('BOOKING_NOT_CANCELLABLE');
          const done = await deps.store.bookings.cancel(
            booking.id,
            'ADMIN',
            actorId,
            `Car park suspended: ${reason}`,
            {
              amountKobo: policy.refundKobo,
              reason: policy.reason,
              refundPriceKobo: policy.refundPriceKobo,
              refundServiceFeeKobo: policy.refundServiceFeeKobo,
            },
            now,
          );
          for (const r of done.refunds) {
            try {
              const sent = await deps.payments.refund({
                reference: r.paymentId,
                amountKobo: r.amountKobo,
              });
              await deps.store.payments.refundRequested(r.id, sent.refundId);
            } catch (err) {
              // The refund row stays; the retry-refunds job sends it again.
              deps.logger.error({ err, bookingId: booking.id, refundId: r.id }, 'refund failed');
            }
          }
          await audit(c, deps, {
            action: 'booking.cancelled_lot_suspended',
            entityType: 'booking',
            entityId: booking.id,
            before: { status: booking.status },
            after: { status: done.booking.status, reason, refundKobo: policy.refundKobo },
          });
          const notice = await bookingNotice(deps.store, done.booking);
          if (notice)
            await deps.notifications.notify({
              key: 'booking.lot_unavailable',
              ...notice.base,
              refundKobo: policy.refundKobo,
            });
          cancelled += 1;
          refundedKobo += policy.refundKobo;
        } catch (err) {
          const code =
            err instanceof ApiError
              ? err.code
              : err instanceof BookingHoldError
                ? err.code
                : 'INTERNAL';
          deps.logger.warn({ bookingId: booking.id, code }, 'lot suspension cancel skipped');
          failed.push({ code, message: `Booking ${booking.code} was not cancelled` });
        }
      }

      await audit(c, deps, {
        action: 'lot.upcoming_bookings_cancelled',
        entityType: 'lot',
        entityId: lot.id,
        after: { reason, cancelled, failed: failed.length, refundedKobo },
      });
      return c.json({ cancelled, failed, refundedKobo }, 200);
    },
  );

  return app;
}
