import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  BookingListQuerySchema,
  BookingListSchema,
  BookingSchema,
  CreateBookingRequestSchema,
  CreateBookingResponseSchema,
  VerifyPaymentResponseSchema,
  type Booking,
  type Checkout,
  type CreateBookingResponse,
} from '@parkly/contracts';
import { checkSearchWindow, isOpenDuring } from '@parkly/domain/availability';
import { holdExpiresAt, paymentSplit } from '@parkly/domain/booking';
import { generateBookingCode } from '@parkly/domain/codes';
import {
  overstayCharge,
  quote as priceQuote,
  type Quote as DomainQuote,
} from '@parkly/domain/pricing';
import { lagosDateKey } from '@parkly/domain/time';
import { v7 as uuidv7 } from 'uuid';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { ApiError } from '../../lib/errors.js';
import { idempotent } from '../../lib/idempotency.js';
import { qrTickets } from '../../lib/qr-tickets.js';
import {
  BookingCodeTakenError,
  BookingHoldError,
  type BookingRow,
  type LotRow,
  type PaymentRow,
} from '../../store/types.js';
import { loadSettings, toOpeningDay, toPublicQuote } from '../discovery/routes.js';
import { verifyAndSettle } from './settle.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const LIST_LIMIT = 50;
const CODE_ATTEMPTS = 3;

/** Paystack needs an email; phone-only drivers get a per-driver address that is never mailed by us. */
const checkoutEmail = (userId: string) => `driver-${userId}@users.parkly.ng`;

export const toCheckout = (p: PaymentRow, booking: BookingRow): Checkout => ({
  reference: p.id,
  status: p.status,
  authorizationUrl: p.status === 'INITIATED' || p.status === 'PENDING' ? p.authorizationUrl : null,
  expiresAt:
    booking.status === 'PENDING_PAYMENT' ? (booking.holdExpiresAt?.toISOString() ?? null) : null,
});

export function toBooking(
  b: BookingRow,
  lot: Pick<LotRow, 'id' | 'slug' | 'name' | 'addressLine' | 'selfCheckinEnabled'>,
  extra: { qrToken?: string | null; overstay?: Booking['overstay']; stay?: Booking['stay'] } = {},
): Booking {
  const lines = (b.pricingBreakdown as DomainQuote['lines'] | null) ?? [];
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    product: b.product,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    holdExpiresAt: b.status === 'PENDING_PAYMENT' ? (b.holdExpiresAt?.toISOString() ?? null) : null,
    lot: {
      id: lot.id,
      slug: lot.slug,
      name: lot.name,
      addressLine: lot.addressLine,
      selfCheckIn: lot.selfCheckinEnabled,
    },
    vehicle: { id: b.vehicleId, plate: b.plateNorm },
    priceKobo: b.priceKobo,
    serviceFeeKobo: b.serviceFeeKobo,
    totalKobo: b.totalKobo,
    lines: toPublicQuote({
      product: b.product,
      priceKobo: b.priceKobo,
      serviceFeeKobo: b.serviceFeeKobo,
      totalKobo: b.totalKobo,
      commissionKobo: 0,
      operatorAmountKobo: 0,
      lines,
    }).lines,
    qrToken: extra.qrToken ?? null,
    overstay: extra.overstay ?? null,
    stay: extra.stay ?? null,
    createdAt: b.createdAt.toISOString(),
  };
}

/**
 * Driver bookings and payment (FR-BOOK-001/003/004, FR-PAY-001/002, doc 02 §6.4).
 * Prices come from the domain engine here; a booking is confirmed only by a
 * server-side verify of the payment, never by the app.
 */
export function bookingRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const middleware = [authenticate(deps.verifyToken), loadActor(deps.store)];
  const secured = { security: [{ bearerAuth: [] }], middleware };
  const ticketFor = qrTickets(deps);

  /**
   * Ticket, overstay price and stay for each booking (ADR 0016). Overstay is
   * priced here with the domain engine: live while the car is still in past
   * end + grace, as recorded after check-out.
   */
  async function viewsFor(rows: BookingRow[]) {
    const now = deps.now();
    const [stays, graceMin] = await Promise.all([
      deps.store.attend.sessionsForBookings(rows.map((r) => r.id)),
      deps.store.settings.get<number>('session.overstay_grace_min').then((v) => v ?? 10),
    ]);
    const plansByLot = new Map<
      string,
      Awaited<ReturnType<typeof deps.store.ratePlans.activeFor>>
    >();
    for (const lotId of new Set(rows.map((r) => r.lotId)))
      plansByLot.set(lotId, await deps.store.ratePlans.activeFor([lotId]));
    const price = (b: BookingRow, checkOutAt: Date) => {
      try {
        const q = overstayCharge({
          ratePlans: plansByLot.get(b.lotId) ?? [],
          endAt: b.endAt,
          checkOutAt,
          graceMin,
          commissionBps: b.commissionBps,
        });
        const line = q.lines[0];
        return { minutes: line?.kind === 'OVERSTAY' ? line.minutes : 0, kobo: q.priceKobo };
      } catch {
        return null; // no hourly or daily price to base it on
      }
    };
    return Promise.all(
      rows.map(async (b) => {
        const one = price(b, new Date(b.endAt.getTime() + (graceMin + 1) * 60_000));
        const s = stays.get(b.id);
        let stay: Booking['stay'] = null;
        if (s) {
          const late =
            !s.checkOutAt && s.checkInAt && now.getTime() > b.endAt.getTime() + graceMin * 60_000;
          const live = late ? price(b, now) : null;
          stay = {
            checkedInAt: s.checkInAt?.toISOString() ?? null,
            checkedOutAt: s.checkOutAt?.toISOString() ?? null,
            overstayMinutes: live ? live.minutes : s.overstayMinutes,
            overstayKobo: live ? live.kobo : s.overstayAmountKobo,
          };
        }
        return {
          qrToken: await ticketFor(b),
          overstay: one ? { graceMin, per15Kobo: one.kobo } : null,
          stay,
        };
      }),
    );
  }

  async function lotOf(lotId: string) {
    const lot = await deps.store.lots.findById(lotId);
    if (!lot) throw new Error(`lot ${lotId} of a booking is missing`);
    return lot;
  }

  /** The driver's own booking, or 404 (never 403: no enumeration). */
  async function ownBooking(c: Parameters<typeof authorize>[0], id: string) {
    const booking = await deps.store.bookings.find(id);
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');
    try {
      authorize(
        c,
        deps.logger,
        'booking:read:own',
        { ownerUserId: booking.driverId },
        {
          denyAs: 'NOT_FOUND',
        },
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND')
        throw new ApiError('BOOKING_NOT_FOUND');
      throw err;
    }
    return booking;
  }

  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings',
      tags: ['bookings'],
      ...secured,
      request: {
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: { ...json(CreateBookingRequestSchema), required: true },
      },
      responses: {
        201: { description: 'Space held; pay to confirm', ...json(CreateBookingResponseSchema) },
      },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'booking:create:own', { ownerUserId: actor.userId });
      const body = c.req.valid('json');
      const result = await idempotent<CreateBookingResponse>(
        deps.store,
        {
          actorId: actor.userId,
          key: c.req.header('idempotency-key'),
          method: 'POST',
          path: '/v1/bookings',
          body,
          now: deps.now(),
        },
        async () => ({ status: 201, body: await createBooking(actor.userId, body) }),
      );
      if (result.replayed) c.header('idempotent-replayed', 'true');
      return c.json(result.body, 201);
    },
  );

  async function createBooking(
    driverId: string,
    body: z.infer<typeof CreateBookingRequestSchema>,
  ): Promise<CreateBookingResponse> {
    const now = deps.now();
    const lot = await deps.store.lots.findLive(body.lotId, lagosDateKey(now));
    if (!lot) throw new ApiError('LOT_NOT_BOOKABLE');
    const vehicle = await deps.store.vehicles.find(driverId, body.vehicleId);
    if (!vehicle) throw new ApiError('NOT_FOUND', 'Vehicle not found');

    const { fees, limits } = await loadSettings(deps.store);
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (checkSearchWindow({ startAt, endAt, now, limits, product: body.product }))
      throw new ApiError(
        'BOOKING_WINDOW_INVALID',
        'Pick a time on the quarter hour, from now up to 30 days ahead, of at most 24 hours',
      );
    const hours = await deps.store.lots.openingHours(lot.id);
    if (!isOpenDuring({ hours: hours.map(toOpeningDay), startAt, endAt, product: body.product }))
      throw new ApiError('BOOKING_OUTSIDE_OPENING_HOURS');
    const plan = (await deps.store.ratePlans.activeFor([lot.id])).find(
      (p) => p.product === body.product,
    );
    if (!plan) throw new ApiError('LOT_NOT_BOOKABLE', 'This lot does not sell that option');
    const priced = priceQuote({
      ratePlan: plan,
      startAt,
      endAt,
      settings: { ...fees, commissionBps: lot.commissionBps },
    });
    if (!priced.ok)
      throw new ApiError(
        'PRICING_INVALID_DURATION',
        `The minimum stay here is ${plan.minMinutes} minutes`,
      );
    const q = priced.quote;
    const split = paymentSplit({
      priceKobo: q.priceKobo,
      serviceFeeKobo: q.serviceFeeKobo,
      commissionBps: lot.commissionBps,
    });

    // The operator's share goes to their Paystack subaccount. Demo lots on dev have none.
    const payout = await deps.store.payoutAccounts.find(lot.operatorId);
    const subaccountCode = payout?.status === 'ACTIVE' ? payout.providerSubaccountCode : null;
    if (!subaccountCode && deps.config.appEnv === 'prod')
      throw new ApiError('LOT_NOT_BOOKABLE', 'This lot cannot take payments yet');

    // No open redirects: Paystack may only send drivers back to our own sites.
    let callbackUrl: string | null = null;
    if (body.returnTo) {
      if (!deps.config.corsOrigins.includes(new URL(body.returnTo).origin))
        throw new ApiError('VALIDATION_FAILED', 'returnTo must be a Parkly site');
      callbackUrl = body.returnTo;
    }

    const holdMinutes = (await deps.store.settings.get<number>('booking.hold_minutes')) ?? 10;
    const bookingId = uuidv7();
    const paymentId = uuidv7();
    let held: Awaited<ReturnType<typeof deps.store.bookings.hold>> | undefined;
    for (let attempt = 1; !held; attempt++) {
      try {
        held = await deps.store.bookings.hold(
          {
            id: bookingId,
            code: generateBookingCode(),
            driverId,
            vehicleId: vehicle.id,
            plateNorm: vehicle.plateNorm,
            lotId: lot.id,
            product: body.product,
            startAt,
            endAt,
            holdExpiresAt: holdExpiresAt(now, holdMinutes),
            priceKobo: q.priceKobo,
            serviceFeeKobo: q.serviceFeeKobo,
            commissionBps: lot.commissionBps,
            ratePlanId: plan.id,
            pricingBreakdown: q.lines,
            source: body.source,
          },
          {
            id: paymentId,
            payerUserId: driverId,
            provider: deps.payments.name === 'paystack' ? 'PAYSTACK' : 'FAKE',
            amountKobo: split.amountKobo,
            platformAmountKobo: split.platformAmountKobo,
            operatorAmountKobo: split.operatorAmountKobo,
            operatorId: lot.operatorId,
            subaccountCode,
          },
          now,
        );
      } catch (err) {
        if (err instanceof BookingHoldError) throw new ApiError(err.code);
        if (err instanceof BookingCodeTakenError && attempt < CODE_ATTEMPTS) continue;
        throw err;
      }
    }

    let payment: PaymentRow;
    try {
      const checkout = await deps.payments.initialize({
        reference: paymentId,
        amountKobo: split.amountKobo,
        email: checkoutEmail(driverId),
        subaccountCode,
        platformShareKobo: split.platformAmountKobo,
        callbackUrl,
        metadata: { bookingCode: held.booking.code, bookingId },
      });
      payment = await deps.store.payments.checkoutStarted(paymentId, checkout, deps.now());
    } catch (err) {
      deps.logger.error({ err, bookingId }, 'checkout could not start');
      await deps.store.bookings.releaseHold(bookingId, 'checkout.failed', deps.now());
      throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
    }
    deps.logger.info({ event: 'booking.hold_created', bookingId, lotId: lot.id }, 'booking held');
    return { booking: toBooking(held.booking, lot), payment: toCheckout(payment, held.booking) };
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/bookings',
      tags: ['bookings'],
      ...secured,
      request: { query: BookingListQuerySchema },
      responses: { 200: { description: 'My bookings', ...json(BookingListSchema) } },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'booking:read:own', { ownerUserId: actor.userId });
      const rows = await deps.store.bookings.listForDriver(
        actor.userId,
        c.req.valid('query').status,
        deps.now(),
        LIST_LIMIT,
      );
      const lots = new Map<string, LotRow>();
      for (const id of new Set(rows.map((r) => r.lotId))) lots.set(id, await lotOf(id));
      const views = await viewsFor(rows);
      const items = rows.map((r, i) => toBooking(r, lots.get(r.lotId) as LotRow, views[i]));
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/bookings/{id}',
      tags: ['bookings'],
      ...secured,
      request: { params: z.object({ id: z.uuid() }) },
      responses: { 200: { description: 'One booking', ...json(BookingSchema) } },
    }),
    async (c) => {
      const booking = await ownBooking(c, c.req.valid('param').id);
      const [view] = await viewsFor([booking]);
      return c.json(toBooking(booking, await lotOf(booking.lotId), view), 200);
    },
  );

  // Doc 01 §5.2: the app returns from checkout before the webhook; ask the provider now.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/payments/{reference}/verify',
      tags: ['bookings'],
      ...secured,
      request: { params: z.object({ reference: z.uuid() }) },
      responses: {
        200: { description: 'Payment and booking now', ...json(VerifyPaymentResponseSchema) },
      },
    }),
    async (c) => {
      const reference = c.req.valid('param').reference;
      const payment = await deps.store.payments.find(reference);
      if (!payment?.bookingId) throw new ApiError('PAYMENT_NOT_FOUND');
      let booking = await ownBooking(c, payment.bookingId).catch((err: unknown) => {
        throw err instanceof ApiError && err.code === 'BOOKING_NOT_FOUND'
          ? new ApiError('PAYMENT_NOT_FOUND')
          : err;
      });
      let current = payment;
      if (payment.status === 'INITIATED' || payment.status === 'PENDING') {
        try {
          const settled = await verifyAndSettle(deps, reference);
          if (settled) ({ booking, payment: current } = settled);
        } catch (err) {
          deps.logger.error({ err, paymentId: reference }, 'verify failed');
          throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
        }
      }
      return c.json(
        {
          payment: toCheckout(current, booking),
          booking: toBooking(booking, await lotOf(booking.lotId), (await viewsFor([booking]))[0]),
        },
        200,
      );
    },
  );

  return app;
}
