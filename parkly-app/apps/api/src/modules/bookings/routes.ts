import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  BookingExtensionSchema,
  BookingListQuerySchema,
  BookingListSchema,
  BookingReceiptSchema,
  BookingSchema,
  CancelBookingRequestSchema,
  CancelBookingResponseSchema,
  CreateBookingRequestSchema,
  CreateBookingResponseSchema,
  ExtendBookingRequestSchema,
  ExtendBookingResponseSchema,
  ExtensionOptionsSchema,
  OverstayPayRequestSchema,
  OverstayPayResponseSchema,
  VerifyPaymentResponseSchema,
  type Booking,
  type BookingExtension,
  type Checkout,
  type CreateBookingResponse,
} from '@parkly/contracts';
import { checkSearchWindow, extensionWindow, isOpenDuring } from '@parkly/domain/availability';
import {
  calculateExtensionQuote,
  cancellationPolicy,
  holdExpiresAt,
  paymentSplit,
  validateExtensionWindow,
} from '@parkly/domain/booking';
import { generateBookingCode } from '@parkly/domain/codes';
import { mulDivRoundHalfUp } from '@parkly/domain/money';
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
  type BookingExtensionRow,
  type BookingRow,
  type LotRow,
  type PaymentRow,
} from '../../store/types.js';
import { loadSettings, toOpeningDay, toPublicQuote } from '../discovery/routes.js';
import { buildReceiptData, renderReceiptHtml } from './receipt.js';
import { verifyAndSettle } from './settle.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const LIST_LIMIT = 50;
const CODE_ATTEMPTS = 3;

/** Paystack needs an email; phone-only drivers get a per-driver address that is never mailed by us. */
const checkoutEmail = (userId: string) => `driver-${userId}@users.parkly.ng`;

/** Longest stay an extension may reach, measured from the booking's start (doc 02 §4). */
const MAX_EXTENDED_STAY_MIN = 24 * 60;

const lagosClock = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
const lagosDay = (d: Date) =>
  d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Africa/Lagos' });

/** "The car park closes at 00:00 and reopens Tue 07:00." (Lagos time) */
export function closedForExtensionDetail(closesAt: Date | null, reopensAt: Date | null): string {
  if (!closesAt) return 'The car park is closed during the extension window';
  const closes = `The car park closes at ${lagosClock(closesAt)}`;
  if (!reopensAt) return `${closes}, so this stay can’t be extended`;
  return `${closes} and reopens ${lagosDay(reopensAt)} ${lagosClock(reopensAt)}`;
}

export const toCheckout = (p: PaymentRow, booking: BookingRow): Checkout => ({
  reference: p.id,
  status: p.status,
  authorizationUrl: p.status === 'INITIATED' || p.status === 'PENDING' ? p.authorizationUrl : null,
  expiresAt:
    booking.status === 'PENDING_PAYMENT' ? (booking.holdExpiresAt?.toISOString() ?? null) : null,
});

export const toBookingExtension = (e: BookingExtensionRow): BookingExtension => ({
  id: e.id,
  bookingId: e.bookingId,
  startAt: e.startAt.toISOString(),
  newEndAt: e.newEndAt.toISOString(),
  addedMinutes: e.addedMinutes,
  priceKobo: e.priceKobo,
  status: e.status,
  createdAt: e.createdAt.toISOString(),
});

export function toBooking(
  b: BookingRow,
  lot: Pick<LotRow, 'id' | 'slug' | 'name' | 'addressLine' | 'selfCheckinEnabled'> &
    Partial<Pick<LotRow, 'area' | 'location' | 'entranceNotes'>>,
  extra: {
    qrToken?: string | null;
    overstay?: Booking['overstay'];
    stay?: Booking['stay'];
    contactPhone?: string | null;
  } = {},
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
      area: lot.area ?? null,
      location: lot.location ?? null,
      entranceNotes: lot.entranceNotes ?? null,
      contactPhone: extra.contactPhone ?? null,
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
    const phoneMap = new Map<string, string | null>();
    for (const lotId of new Set(rows.map((r) => r.lotId))) {
      plansByLot.set(lotId, await deps.store.ratePlans.activeFor([lotId]));
      const l = await lotOf(lotId);
      const op = await deps.store.operators.find(l.operatorId);
      phoneMap.set(lotId, op?.contactPhoneEnc ? deps.crypto.decrypt(op.contactPhoneEnc) : null);
    }
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
        // Same grace as check-out pricing (attend routes), so drivers see what they'll be charged.
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
          contactPhone: phoneMap.get(b.lotId) ?? null,
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
  /**
   * Runs a mutating booking request once per Idempotency-Key (AGENTS.md §5, gap
   * review P-13): a double tap or a retry gets the first response back instead
   * of a second checkout. Same store and rules as POST /bookings.
   */
  async function replayable<R extends Response>(
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
    const allowTestStays = deps.config.testShortStays;
    if (checkSearchWindow({ startAt, endAt, now, limits, product: body.product, allowTestStays }))
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
      allowTestStays,
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
    const op = await deps.store.operators.find(lot.operatorId);
    const contactPhone = op?.contactPhoneEnc ? deps.crypto.decrypt(op.contactPhoneEnc) : null;
    return {
      booking: toBooking(held.booking, lot, { contactPhone }),
      payment: toCheckout(payment, held.booking),
    };
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

  app.openapi(
    createRoute({
      method: 'get',
      path: '/bookings/{id}/receipt',
      tags: ['bookings'],
      ...secured,
      request: {
        params: z.object({ id: z.uuid() }),
        query: z.object({ format: z.enum(['json', 'html', 'pdf']).default('json') }),
      },
      responses: {
        200: {
          description: 'Booking receipt',
          content: {
            'application/json': { schema: BookingReceiptSchema },
            'text/html': { schema: z.string() },
          },
        },
      },
    }),
    async (c) => {
      const booking = await ownBooking(c, c.req.valid('param').id);
      const [lot, user, payments, refunds] = await Promise.all([
        lotOf(booking.lotId),
        deps.store.users.find(booking.driverId),
        deps.store.payments.listForBooking(booking.id),
        deps.store.payments.refundsForBooking(booking.id),
      ]);
      const receipt = buildReceiptData({
        booking,
        lot,
        user,
        payments,
        refunds,
        now: deps.now(),
      });
      const format = c.req.valid('query').format;
      const accept = c.req.header('accept') ?? '';
      if (format === 'html' || format === 'pdf' || accept.includes('text/html')) {
        return c.html(renderReceiptHtml(receipt), 200);
      }
      return c.json(receipt, 200);
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

  // FR-BOOK-005: how far this stay can be extended, so clients only offer valid durations.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/bookings/{id}/extensions/options',
      tags: ['bookings'],
      ...secured,
      request: { params: z.object({ id: z.uuid() }) },
      responses: {
        200: { description: 'Extension options', ...json(ExtensionOptionsSchema) },
      },
    }),
    async (c) => {
      const booking = await ownBooking(c, c.req.valid('param').id);
      const maxEndAt = new Date(booking.startAt.getTime() + MAX_EXTENDED_STAY_MIN * 60_000);
      const extendable = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';
      if (!extendable) {
        return c.json(
          {
            extendable: false,
            extendableUntil: null,
            closesAt: null,
            reopensAt: null,
            maxEndAt: maxEndAt.toISOString(),
          },
          200,
        );
      }
      const hours = await deps.store.lots.openingHours(booking.lotId);
      const w = extensionWindow({
        hours: hours.map(toOpeningDay),
        currentEndAt: booking.endAt,
        maxEndAt,
        product: booking.product,
      });
      return c.json(
        {
          extendable: true,
          extendableUntil: w.extendableUntil?.toISOString() ?? null,
          closesAt: w.closesAt?.toISOString() ?? null,
          reopensAt: w.reopensAt?.toISOString() ?? null,
          maxEndAt: maxEndAt.toISOString(),
        },
        200,
      );
    },
  );

  // FR-BOOK-005: extend a booking forward on the 15-minute grid.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings/{id}/extensions',
      tags: ['bookings'],
      ...secured,
      request: {
        params: z.object({ id: z.uuid() }),
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: { ...json(ExtendBookingRequestSchema), required: true },
      },
      responses: {
        200: { description: 'Booking extension', ...json(ExtendBookingResponseSchema) },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return replayable(c, `/v1/bookings/${id}/extensions`, async () => {
        const body = c.req.valid('json');
        const actor = c.get('actor');
        const booking = await ownBooking(c, id);
        const now = deps.now();

        const newEndAt = new Date(body.newEndAt);
        const validation = validateExtensionWindow({
          startAt: booking.startAt,
          currentEndAt: booking.endAt,
          newEndAt,
          now,
          status: booking.status,
          maxDurationMinutes: MAX_EXTENDED_STAY_MIN,
          graceMin: await deps.store.settings
            .get<number>('session.overstay_grace_min')
            .then((v) => v ?? 10),
          allowTestStays: deps.config.testShortStays,
        });
        if (!validation.ok) {
          if (validation.code === 'BOOKING_NOT_EXTENDABLE') {
            throw new ApiError('BOOKING_NOT_EXTENDABLE', 'This booking cannot be extended');
          }
          if (validation.code === 'EXTENSION_TOO_LATE') {
            throw new ApiError(
              'BOOKING_WINDOW_INVALID',
              'This stay has already ended. Pay the overstay at check-out instead',
            );
          }
          throw new ApiError(
            'BOOKING_WINDOW_INVALID',
            `Invalid extension window: ${validation.code}`,
          );
        }

        const lot = await lotOf(booking.lotId);
        const hours = (await deps.store.lots.openingHours(lot.id)).map(toOpeningDay);
        if (
          !isOpenDuring({
            hours,
            startAt: booking.endAt,
            endAt: newEndAt,
            product: booking.product,
          })
        ) {
          const w = extensionWindow({
            hours,
            currentEndAt: booking.endAt,
            maxEndAt: newEndAt,
            product: booking.product,
          });
          throw new ApiError(
            'BOOKING_OUTSIDE_OPENING_HOURS',
            closedForExtensionDetail(w.closesAt, w.reopensAt),
          );
        }

        const plans = await deps.store.ratePlans.activeFor([lot.id]);
        const plan = plans.find((p) => p.product === booking.product);
        if (!plan)
          throw new ApiError('LOT_NOT_BOOKABLE', 'This lot does not have an active rate plan');

        const extQuote = calculateExtensionQuote({
          ratePlan: plan,
          settings: { commissionBps: booking.commissionBps },
          startAt: booking.startAt,
          currentEndAt: booking.endAt,
          newEndAt,
          currentPriceKobo: booking.priceKobo,
        });

        const extensionId = uuidv7();

        if (extQuote.priceKobo === 0) {
          try {
            const held = await deps.store.bookings.holdExtension(
              {
                id: extensionId,
                bookingId: booking.id,
                newEndAt,
                priceKobo: 0,
                platformAmountKobo: 0,
                operatorAmountKobo: 0,
                holdExpiresAt: now,
              },
              null,
              now,
            );
            const updatedBooking = await deps.store.bookings.confirmExtension(
              extensionId,
              null,
              now,
            );
            const extRow = await deps.store.bookings.findExtension(extensionId);
            const [view] = await viewsFor([updatedBooking]);
            return c.json(
              {
                extension: toBookingExtension(extRow ?? held.extension),
                booking: toBooking(updatedBooking, lot, view),
                payment: null,
              },
              200,
            );
          } catch (err) {
            if (err instanceof BookingHoldError) throw new ApiError(err.code);
            throw err;
          }
        }

        const payout = await deps.store.payoutAccounts.find(lot.operatorId);
        const subaccountCode = payout?.status === 'ACTIVE' ? payout.providerSubaccountCode : null;
        if (!subaccountCode && deps.config.appEnv === 'prod') {
          throw new ApiError('LOT_NOT_BOOKABLE', 'This lot cannot take payments yet');
        }

        let callbackUrl: string | null = null;
        if (body.returnTo) {
          if (!deps.config.corsOrigins.includes(new URL(body.returnTo).origin)) {
            throw new ApiError('VALIDATION_FAILED', 'returnTo must be a Parkly site');
          }
          callbackUrl = body.returnTo;
        }

        const paymentId = uuidv7();
        let held: Awaited<ReturnType<typeof deps.store.bookings.holdExtension>>;
        try {
          held = await deps.store.bookings.holdExtension(
            {
              id: extensionId,
              bookingId: booking.id,
              newEndAt,
              priceKobo: extQuote.priceKobo,
              platformAmountKobo: extQuote.commissionKobo,
              operatorAmountKobo: extQuote.operatorAmountKobo,
              holdExpiresAt: holdExpiresAt(
                now,
                (await deps.store.settings.get<number>('booking.hold_minutes')) ?? 10,
              ),
            },
            {
              id: paymentId,
              kind: 'EXTENSION',
              payerUserId: actor.userId,
              provider: deps.payments.name === 'paystack' ? 'PAYSTACK' : 'FAKE',
              amountKobo: extQuote.priceKobo,
              platformAmountKobo: extQuote.commissionKobo,
              operatorAmountKobo: extQuote.operatorAmountKobo,
              operatorId: lot.operatorId,
              subaccountCode,
            },
            now,
          );
        } catch (err) {
          if (err instanceof BookingHoldError) throw new ApiError(err.code);
          throw err;
        }

        let payment: PaymentRow;
        try {
          const checkout = await deps.payments.initialize({
            reference: paymentId,
            amountKobo: extQuote.priceKobo,
            email: checkoutEmail(actor.userId),
            subaccountCode,
            platformShareKobo: extQuote.commissionKobo,
            callbackUrl,
            metadata: { bookingCode: booking.code, bookingId: booking.id, extensionId },
          });
          payment = await deps.store.payments.checkoutStarted(paymentId, checkout, deps.now());
        } catch (err) {
          deps.logger.error(
            { err, bookingId: booking.id, extensionId },
            'extension checkout failed',
          );
          // Give the space back now rather than when the hold runs out (gap review P-4).
          await deps.store.bookings.releaseExtension(extensionId, 'EXPIRED', deps.now());
          throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
        }

        const [view] = await viewsFor([booking]);
        return c.json(
          {
            extension: toBookingExtension(held.extension),
            booking: toBooking(booking, lot, view),
            payment: toCheckout(payment, booking),
          },
          200,
        );
      });
    },
  );

  // FR-BOOK-006: cancel a booking with policy calculation and optional refund.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings/{id}/cancel',
      tags: ['bookings'],
      ...secured,
      request: {
        params: z.object({ id: z.uuid() }),
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: { ...json(CancelBookingRequestSchema), required: false },
      },
      responses: {
        200: { description: 'Booking cancellation', ...json(CancelBookingResponseSchema) },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return replayable(c, `/v1/bookings/${id}/cancel`, async () => {
        const body = c.req.valid('json') ?? {};
        const actor = c.get('actor');
        const booking = await ownBooking(c, id);
        const now = deps.now();

        const freeLeadMin =
          (await deps.store.settings.get<number>('booking.free_cancellation_lead_min')) ?? 30;
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

        if (!policy.cancellable) {
          throw new ApiError('BOOKING_NOT_CANCELLABLE', 'This booking cannot be cancelled');
        }

        let cancelled: Awaited<ReturnType<typeof deps.store.bookings.cancel>>;
        try {
          cancelled = await deps.store.bookings.cancel(
            booking.id,
            'DRIVER',
            actor.userId,
            body.reason ?? 'DRIVER_CANCEL',
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

        if (policy.refundKobo > 0 && cancelled.refundId) {
          const latestPayment = await deps.store.payments.latestForBooking(booking.id);
          if (latestPayment) {
            try {
              const sent = await deps.payments.refund({
                reference: latestPayment.id,
                amountKobo: policy.refundKobo,
              });
              await deps.store.payments.refundRequested(cancelled.refundId, sent.refundId);
            } catch (err) {
              deps.logger.error(
                { err, bookingId: booking.id, refundId: cancelled.refundId },
                'cancellation refund request failed',
              );
            }
          }
        }

        const lot = await lotOf(booking.lotId);
        const [view] = await viewsFor([cancelled.booking]);
        return c.json(
          {
            booking: toBooking(cancelled.booking, lot, view),
            refundKobo: policy.refundKobo,
            isFreeCancellation: policy.isFreeCancellation,
          },
          200,
        );
      });
    },
  );

  // FR-BOOK-008: pay overstay charges.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings/{id}/overstay/pay',
      tags: ['bookings'],
      ...secured,
      request: {
        params: z.object({ id: z.uuid() }),
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: { ...json(OverstayPayRequestSchema), required: false },
      },
      responses: {
        200: { description: 'Overstay checkout initiated', ...json(OverstayPayResponseSchema) },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return replayable(c, `/v1/bookings/${id}/overstay/pay`, async () => {
        const body = c.req.valid('json') ?? {};
        const actor = c.get('actor');
        const booking = await ownBooking(c, id);
        const now = deps.now();

        const session = await deps.store.attend.sessionByBooking(booking.id);
        if (!session || session.overstayStatus !== 'DUE' || session.overstayAmountKobo <= 0) {
          throw new ApiError('OVERSTAY_NOT_DUE', 'No overstay payment is due for this booking');
        }

        // One open checkout per overstay: a second tap or tab gets the same one (gap review P-7).
        const openCheckout = async () =>
          (await deps.store.payments.listForBooking(booking.id)).find(
            (p) =>
              p.kind === 'OVERSTAY' &&
              p.status === 'PENDING' &&
              p.authorizationUrl !== null &&
              p.amountKobo === session.overstayAmountKobo,
          );
        const reply = (payment: PaymentRow) =>
          c.json(
            {
              payment: toCheckout(payment, booking),
              overstayMinutes: session.overstayMinutes,
              amountKobo: session.overstayAmountKobo,
            },
            200,
          );
        const open = await openCheckout();
        if (open) return reply(open);

        const lot = await lotOf(booking.lotId);
        const payout = await deps.store.payoutAccounts.find(lot.operatorId);
        const subaccountCode = payout?.status === 'ACTIVE' ? payout.providerSubaccountCode : null;
        if (!subaccountCode && deps.config.appEnv === 'prod') {
          throw new ApiError('LOT_NOT_BOOKABLE', 'This lot cannot take payments yet');
        }

        let callbackUrl: string | null = null;
        if (body.returnTo) {
          if (!deps.config.corsOrigins.includes(new URL(body.returnTo).origin)) {
            throw new ApiError('VALIDATION_FAILED', 'returnTo must be a Parkly site');
          }
          callbackUrl = body.returnTo;
        }

        const commissionKobo = mulDivRoundHalfUp(
          session.overstayAmountKobo,
          booking.commissionBps,
          10_000,
        );
        const operatorAmountKobo = session.overstayAmountKobo - commissionKobo;

        const paymentId = uuidv7();
        await deps.store.payments.create(
          {
            id: paymentId,
            payerUserId: actor.userId,
            bookingId: booking.id,
            kind: 'OVERSTAY',
            provider: deps.payments.name === 'paystack' ? 'PAYSTACK' : 'FAKE',
            amountKobo: session.overstayAmountKobo,
            platformAmountKobo: commissionKobo,
            operatorAmountKobo,
            operatorId: lot.operatorId,
            subaccountCode,
          },
          now,
        );

        let payment: PaymentRow;
        try {
          const checkout = await deps.payments.initialize({
            reference: paymentId,
            amountKobo: session.overstayAmountKobo,
            email: checkoutEmail(actor.userId),
            subaccountCode,
            platformShareKobo: commissionKobo,
            callbackUrl,
            metadata: { bookingCode: booking.code, bookingId: booking.id, kind: 'OVERSTAY' },
          });
          payment = await deps.store.payments.checkoutStarted(paymentId, checkout, now);
        } catch (err) {
          // Another tab opened a checkout at the same moment: hand back that one.
          const raced = await openCheckout();
          if (raced) return reply(raced);
          deps.logger.error({ err, bookingId: booking.id, paymentId }, 'overstay checkout failed');
          throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
        }

        return reply(payment);
      });
    },
  );

  return app;
}
