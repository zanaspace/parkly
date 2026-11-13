import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreatePassRequestSchema,
  CreatePassResponseSchema,
  JoinPassWaitlistRequestSchema,
  PassListQuerySchema,
  PassListSchema,
  PassSchema,
  PassWaitlistResponseSchema,
  RenewPassRequestSchema,
  SelfCheckRequestSchema,
  SelfCheckResultSchema,
  SwapPassVehicleRequestSchema,
  VerifyPassPaymentResponseSchema,
  type Checkout,
  type CreatePassResponse,
  type Pass,
} from '@parkly/contracts';
import { holdExpiresAt, paymentSplit } from '@parkly/domain/booking';
import {
  distanceM,
  isAttendantGateCode,
  parseGateCode,
  SELF_CHECKIN_RADIUS_M,
} from '@parkly/domain/checkin';
import { generateBookingCode } from '@parkly/domain/codes';
import { MAX_PASS_SWAPS_PER_MONTH, passPeriod } from '@parkly/domain/pass';
import { quote as priceQuote } from '@parkly/domain/pricing';
import { lagosDateKey } from '@parkly/domain/time';
import { checkVerifiedDriverGate } from '@parkly/domain/verification';
import { v7 as uuidv7 } from 'uuid';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { gateCodes } from '../../lib/gate-codes.js';
import { idempotent } from '../../lib/idempotency.js';
import { passQrTickets } from '../../lib/qr-tickets.js';
import {
  BookingCodeTakenError,
  PassHoldError,
  PassSwapError,
  type LotRow,
  type PassRow,
  type PaymentRow,
} from '../../store/types.js';
import { loadSettings } from '../discovery/routes.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const CODE_ATTEMPTS = 3;
const checkoutEmail = (userId: string) => `driver-${userId}@users.parkly.ng`;

export const toPassCheckout = (p: PaymentRow, pass: PassRow): Checkout => ({
  reference: p.id,
  status: p.status,
  authorizationUrl: p.status === 'INITIATED' || p.status === 'PENDING' ? p.authorizationUrl : null,
  expiresAt: pass.status === 'HELD' ? (pass.holdExpiresAt?.toISOString() ?? null) : null,
});

function nextDayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Monthly passes (FR-PASS-001…005, Sprint 9):
 * - Purchase with monthly capacity cap (`pass.max_share_percent`, default 50%)
 * - Offline Ed25519 QR ticket (`t: 'P'`)
 * - One vehicle in lot at a time check-in rule
 * - Vehicle swap up to 2 times/month (`FR-PASS-004`)
 * - One-tap renewal (`FR-PASS-003`) & waitlist (`FR-PASS-001`)
 * - Verified Driver gating (`FR-PASS-005`)
 */
export function passRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const middleware = [authenticate(deps.verifyToken), loadActor(deps.store)];
  const secured = { security: [{ bearerAuth: [] }], middleware };
  const ticketFor = passQrTickets(deps);
  const codes = gateCodes(deps.crypto);

  async function lotOf(lotId: string): Promise<LotRow> {
    const lot = await deps.store.lots.findById(lotId);
    if (!lot) throw new Error(`lot ${lotId} of a pass is missing`);
    return lot;
  }

  async function toPass(p: PassRow): Promise<Pass> {
    const [lot, session, qrToken, driver] = await Promise.all([
      lotOf(p.lotId),
      deps.store.passes.sessionForPass(p.id),
      ticketFor(p),
      deps.store.users.find(p.driverId),
    ]);
    return {
      id: p.id,
      code: p.code,
      status: p.status,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      holdExpiresAt: p.status === 'HELD' ? (p.holdExpiresAt?.toISOString() ?? null) : null,
      lot: {
        id: lot.id,
        slug: lot.slug,
        name: lot.name,
        addressLine: lot.addressLine,
        area: lot.area ?? null,
        location: lot.location ?? null,
        entranceNotes: lot.entranceNotes ?? null,
        selfCheckIn: lot.selfCheckinEnabled,
        requiresVerifiedDriver: lot.requiresVerifiedDriver ?? false,
      },
      vehicle: { id: p.vehicleId, plate: p.plateNorm },
      swapsUsed: p.swapsUsed,
      swapsRemaining: Math.max(0, MAX_PASS_SWAPS_PER_MONTH - p.swapsUsed),
      priceKobo: p.priceKobo,
      serviceFeeKobo: p.serviceFeeKobo,
      totalKobo: p.totalKobo,
      lines: [
        {
          kind: 'MONTH' as const,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          amountKobo: p.priceKobo,
        },
        ...(p.serviceFeeKobo > 0
          ? [
              {
                kind: 'SERVICE_FEE' as const,
                amountKobo: p.serviceFeeKobo,
              },
            ]
          : []),
      ],
      qrToken,
      inLot: Boolean(session?.inLot),
      checkedInAt: session?.checkedInAt ? session.checkedInAt.toISOString() : null,
      renewedFromId: p.renewedFromPassId ?? null,
      driverVerified: Boolean(driver?.isVerifiedDriver),
      createdAt: p.createdAt.toISOString(),
    };
  }

  async function ownPass(c: Parameters<typeof authorize>[0], id: string): Promise<PassRow> {
    const pass = await deps.store.passes.find(id);
    if (!pass) throw new ApiError('PASS_NOT_FOUND');
    try {
      authorize(
        c,
        deps.logger,
        'booking:read:own',
        { ownerUserId: pass.driverId },
        { denyAs: 'NOT_FOUND' },
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') throw new ApiError('PASS_NOT_FOUND');
      throw err;
    }
    return pass;
  }

  async function createPassForDriver(
    driverId: string,
    input: {
      lotId: string;
      vehicleId: string;
      startDate: string;
      source: 'WEB' | 'MOBILE';
      returnTo?: string;
      renewedFromId?: string | null;
    },
  ): Promise<CreatePassResponse> {
    const now = deps.now();
    const unpaid = await deps.store.attend.unpaidOverstay(driverId);
    if (unpaid) {
      throw new ApiError(
        'OVERSTAY_UNPAID',
        `Pay the overstay on booking ${unpaid.bookingCode} before purchasing a pass`,
      );
    }
    const lot = await deps.store.lots.findLive(input.lotId, lagosDateKey(now));
    if (!lot) throw new ApiError('LOT_NOT_BOOKABLE');

    const [driver, platformRequiresVerified] = await Promise.all([
      deps.store.users.find(driverId),
      deps.store.settings.get<boolean>('pass.requires_verified_driver'),
    ]);
    const verGate = checkVerifiedDriverGate({
      lotRequiresVerifiedDriver:
        Boolean(lot.requiresVerifiedDriver) || Boolean(platformRequiresVerified),
      isVerifiedDriver: Boolean(driver?.isVerifiedDriver),
    });
    if (!verGate.ok)
      throw new ApiError(
        'DRIVER_VERIFICATION_REQUIRED',
        'Verified driver required for monthly passes',
      );

    const vehicle = await deps.store.vehicles.find(driverId, input.vehicleId);
    if (!vehicle) throw new ApiError('NOT_FOUND', 'Vehicle not found');

    const today = lagosDateKey(now);
    const maxStartMs = Date.parse(`${today}T00:00:00.000Z`) + 30 * 86_400_000;
    const maxStartDate = new Date(maxStartMs).toISOString().slice(0, 10);
    if (!input.startDate || input.startDate < today || input.startDate > maxStartDate) {
      throw new ApiError(
        'BOOKING_WINDOW_INVALID',
        'Pick a start date from today up to 30 days ahead (YYYY-MM-DD)',
      );
    }
    const period = passPeriod(input.startDate);

    const plan = (await deps.store.ratePlans.activeFor([lot.id])).find(
      (p) => p.product === 'MONTHLY',
    );
    if (!plan) throw new ApiError('LOT_NOT_BOOKABLE', 'This lot does not sell monthly passes');

    const { fees } = await loadSettings(deps.store);
    const priced = priceQuote({
      ratePlan: plan,
      startAt: new Date(period.startsAt),
      endAt: new Date(period.endsAt),
      settings: { ...fees, commissionBps: lot.commissionBps },
    });
    if (!priced.ok) throw new ApiError('PRICING_INVALID_DURATION');
    const q = priced.quote;
    const split = paymentSplit({
      priceKobo: q.priceKobo,
      serviceFeeKobo: q.serviceFeeKobo,
      commissionBps: lot.commissionBps,
    });

    const payout = await deps.store.payoutAccounts.find(lot.operatorId);
    const subaccountCode = payout?.status === 'ACTIVE' ? payout.providerSubaccountCode : null;
    if (!subaccountCode && deps.config.appEnv === 'prod') {
      throw new ApiError('LOT_NOT_BOOKABLE', 'This lot cannot take payments yet');
    }

    let callbackUrl: string | null = null;
    if (input.returnTo) {
      if (!deps.config.corsOrigins.includes(new URL(input.returnTo).origin)) {
        throw new ApiError('VALIDATION_FAILED', 'returnTo must be a Parkly site');
      }
      callbackUrl = input.returnTo;
    }

    const [holdMinutes, maxSharePercent] = await Promise.all([
      deps.store.settings.get<number>('booking.hold_minutes').then((v) => v ?? 10),
      deps.store.settings.get<number>('pass.max_share_percent').then((v) => v ?? 50),
    ]);

    const passId = uuidv7();
    const paymentId = uuidv7();
    const providerName =
      deps.payments.name === 'paystack'
        ? 'PAYSTACK'
        : deps.payments.name === 'flutterwave'
          ? 'FLUTTERWAVE'
          : 'FAKE';

    let held: Awaited<ReturnType<typeof deps.store.passes.hold>> | undefined;
    for (let attempt = 1; !held; attempt++) {
      try {
        held = await deps.store.passes.hold(
          {
            id: passId,
            code: generateBookingCode(),
            driverId,
            vehicleId: vehicle.id,
            plateNorm: vehicle.plateNorm,
            lotId: lot.id,
            ratePlanId: plan.id,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            startsAt: new Date(period.startsAt),
            endsAt: new Date(period.endsAt),
            holdExpiresAt: holdExpiresAt(now, holdMinutes),
            priceKobo: q.priceKobo,
            serviceFeeKobo: q.serviceFeeKobo,
            commissionBps: lot.commissionBps,
            pricingBreakdown: q,
            renewedFromPassId: input.renewedFromId ?? null,
            source: input.source,
          },
          {
            id: paymentId,
            payerUserId: driverId,
            provider: providerName,
            amountKobo: split.amountKobo,
            platformAmountKobo: split.platformAmountKobo,
            operatorAmountKobo: split.operatorAmountKobo,
            operatorId: lot.operatorId,
            subaccountCode,
          },
          maxSharePercent,
          now,
        );
      } catch (err) {
        if (err instanceof PassHoldError) {
          if (err.code === 'PASS_CAPACITY_UNAVAILABLE') {
            throw new ApiError('BOOKING_LOT_FULL', 'This car park has reached its monthly pass capacity limit');
          }
          throw new ApiError(err.code);
        }
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
        metadata: { passCode: held.pass.code, passId },
      });
      payment = await deps.store.payments.checkoutStarted(paymentId, checkout, deps.now());
    } catch (err) {
      deps.logger.error({ err, passId }, 'pass checkout could not start');
      throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
    }

    return {
      pass: await toPass(held.pass),
      payment: toPassCheckout(payment, held.pass),
    };
  }

  app.openapi(
    createRoute({
      method: 'post',
      path: '/passes',
      tags: ['passes'],
      ...secured,
      request: {
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: { ...json(CreatePassRequestSchema), required: true },
      },
      responses: {
        201: { description: 'Monthly pass held; pay to activate', ...json(CreatePassResponseSchema) },
      },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'booking:create:own', { ownerUserId: actor.userId });
      const body = c.req.valid('json');
      const result = await idempotent<CreatePassResponse>(
        deps.store,
        {
          actorId: actor.userId,
          key: c.req.header('idempotency-key'),
          method: 'POST',
          path: '/v1/passes',
          body,
          now: deps.now(),
        },
        async () => ({
          status: 201,
          body: await createPassForDriver(actor.userId, body),
        }),
      );
      if (result.replayed) c.header('idempotent-replayed', 'true');
      return c.json(result.body, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/passes',
      tags: ['passes'],
      ...secured,
      request: { query: PassListQuerySchema },
      responses: { 200: { description: 'My monthly passes', ...json(PassListSchema) } },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'booking:read:own', { ownerUserId: actor.userId });
      const q = c.req.valid('query');
      const rows = await deps.store.passes.listForDriver(
        actor.userId,
        q.status,
        lagosDateKey(deps.now()),
        50,
      );
      const items = await Promise.all(rows.map((r) => toPass(r)));
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/passes/{id}',
      tags: ['passes'],
      ...secured,
      request: { params: z.object({ id: z.uuid() }) },
      responses: { 200: { description: 'Monthly pass details', ...json(PassSchema) } },
    }),
    async (c) => {
      const pass = await ownPass(c, c.req.valid('param').id);
      return c.json(await toPass(pass), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/passes/{id}/verify',
      tags: ['passes'],
      ...secured,
      request: { params: z.object({ id: z.uuid() }) },
      responses: {
        200: {
          description: 'Pass payment verified and pass activated',
          ...json(VerifyPassPaymentResponseSchema),
        },
      },
    }),
    async (c) => {
      const pass = await ownPass(c, c.req.valid('param').id);
      const payment = await deps.store.passes.paymentForPass(pass.id);
      if (!payment) throw new ApiError('PAYMENT_NOT_FOUND');

      let currentPass = pass;
      let currentPayment = payment;
      if (payment.status === 'INITIATED' || payment.status === 'PENDING') {
        try {
          const charge = await deps.payments.verify(payment.id);
          if (charge) {
            const settled = await deps.store.passes.settle(payment.id, charge, deps.now());
            if (settled) {
              currentPass = settled.pass;
              currentPayment = settled.payment;
            }
          }
        } catch (err) {
          deps.logger.error({ err, passId: pass.id, paymentId: payment.id }, 'pass verify failed');
          throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
        }
      }
      return c.json(
        {
          pass: await toPass(currentPass),
          payment: toPassCheckout(currentPayment, currentPass),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/passes/{id}/swap-vehicle',
      tags: ['passes'],
      ...secured,
      request: {
        params: z.object({ id: z.uuid() }),
        body: { ...json(SwapPassVehicleRequestSchema), required: true },
      },
      responses: {
        200: { description: 'Pass vehicle swapped (max 2/month)', ...json(PassSchema) },
      },
    }),
    async (c) => {
      const actor = c.get('actor');
      const pass = await ownPass(c, c.req.valid('param').id);
      authorize(c, deps.logger, 'booking:update:own', { ownerUserId: actor.userId });
      const { vehicleId } = c.req.valid('json');
      const vehicle = await deps.store.vehicles.find(actor.userId, vehicleId);
      if (!vehicle) throw new ApiError('NOT_FOUND', 'Vehicle not found');

      let updated: PassRow;
      try {
        updated = await deps.store.passes.swapVehicle(
          pass.id,
          vehicle.id,
          vehicle.plateNorm,
          lagosDateKey(deps.now()),
          deps.now(),
        );
      } catch (err) {
        if (err instanceof PassSwapError) {
          if (err.code === 'PASS_NOT_ACTIVE') throw new ApiError('PASS_NOT_ACTIVE');
          if (err.code === 'PASS_SWAP_LIMIT_REACHED') throw new ApiError('PASS_SWAP_LIMIT_REACHED');
          throw new ApiError('VALIDATION_FAILED', 'Pass is already assigned to that vehicle');
        }
        throw err;
      }

      await audit(c, deps, {
        action: 'pass.vehicle_swapped',
        entityType: 'pass',
        entityId: pass.id,
        before: { vehicleId: pass.vehicleId, plateNorm: pass.plateNorm, swapsUsed: pass.swapsUsed },
        after: {
          vehicleId: updated.vehicleId,
          plateNorm: updated.plateNorm,
          swapsUsed: updated.swapsUsed,
        },
      });
      return c.json(await toPass(updated), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/passes/{id}/renew',
      tags: ['passes'],
      ...secured,
      request: {
        params: z.object({ id: z.uuid() }),
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: { ...json(RenewPassRequestSchema), required: true },
      },
      responses: {
        201: { description: 'Renewal pass held; pay to activate', ...json(CreatePassResponseSchema) },
      },
    }),
    async (c) => {
      const actor = c.get('actor');
      const pass = await ownPass(c, c.req.valid('param').id);
      authorize(c, deps.logger, 'booking:create:own', { ownerUserId: actor.userId });
      const body = c.req.valid('json');
      const today = lagosDateKey(deps.now());
      const startDate = pass.periodEnd >= today ? nextDayKey(pass.periodEnd) : today;

      const result = await idempotent<CreatePassResponse>(
        deps.store,
        {
          actorId: actor.userId,
          key: c.req.header('idempotency-key'),
          method: 'POST',
          path: `/v1/passes/${pass.id}/renew`,
          body,
          now: deps.now(),
        },
        async () => ({
          status: 201,
          body: await createPassForDriver(actor.userId, {
            lotId: pass.lotId,
            vehicleId: pass.vehicleId,
            startDate,
            source: body.source,
            returnTo: body.returnTo,
            renewedFromId: pass.id,
          }),
        }),
      );
      if (result.replayed) c.header('idempotent-replayed', 'true');
      return c.json(result.body, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/passes/waitlist',
      tags: ['passes'],
      ...secured,
      request: { body: { ...json(JoinPassWaitlistRequestSchema), required: true } },
      responses: {
        201: { description: 'Joined monthly pass waitlist', ...json(PassWaitlistResponseSchema) },
      },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'booking:create:own', { ownerUserId: actor.userId });
      const body = c.req.valid('json');
      const now = deps.now();
      const lot = await deps.store.lots.findLive(body.lotId, lagosDateKey(now));
      if (!lot) throw new ApiError('LOT_NOT_BOOKABLE');
      const desiredStart = (body as { desiredStart?: string; desiredStartDate?: string }).desiredStart ??
        (body as { desiredStart?: string; desiredStartDate?: string }).desiredStartDate;
      if (!desiredStart) throw new ApiError('VALIDATION_FAILED', 'desiredStartDate is required');
      const today = lagosDateKey(now);
      const maxStartMs = Date.parse(`${today}T00:00:00.000Z`) + 30 * 86_400_000;
      const maxStartDate = new Date(maxStartMs).toISOString().slice(0, 10);
      if (desiredStart < today || desiredStart > maxStartDate) {
        throw new ApiError(
          'BOOKING_WINDOW_INVALID',
          'Pick a desired start date from today up to 30 days ahead',
        );
      }
      const period = passPeriod(desiredStart);
      const entry = await deps.store.passes.joinWaitlist(
        {
          lotId: lot.id,
          driverId: actor.userId,
          desiredStartDate: desiredStart,
        },
        now,
      );
      return c.json(
        {
          id: entry.id,
          lotId: entry.lotId,
          desiredStart: entry.desiredStartDate,
          desiredStartDate: entry.desiredStartDate,
          status: entry.status,
          createdAt: entry.createdAt.toISOString(),
        },
        201,
      );
    },
  );

  async function passSelfCheck(
    c: Parameters<typeof authorize>[0],
    passId: string,
    type: 'CHECK_IN' | 'CHECK_OUT',
  ) {
    const body = SelfCheckRequestSchema.parse(await c.req.json().catch(() => ({})));
    const pass = await ownPass(c, passId);
    const lot = await deps.store.lots.findById(pass.lotId);
    if (!lot) throw new ApiError('LOT_NOT_FOUND');
    const now = deps.now();
    if (!codes.verify(body.code, now)) throw new ApiError('QR_WRONG_LOT');
    if (!lot.selfCheckinEnabled && !isAttendantGateCode(body.code)) {
      throw new ApiError('SELF_CHECKIN_OFF');
    }
    if (parseGateCode(body.code) !== lot.id) throw new ApiError('QR_WRONG_LOT');
    if (distanceM(lot.location, { lat: body.lat, lng: body.lng }) > SELF_CHECKIN_RADIUS_M) {
      throw new ApiError('SELF_CHECKIN_TOO_FAR');
    }
    const actor = c.get('actor');
    const today = lagosDateKey(now);
    if (type === 'CHECK_IN') {
      const res = await deps.store.passes.checkIn(
        pass.id,
        lot.id,
        actor.userId,
        'SELF',
        today,
        now,
      );
      return res;
    }
    return deps.store.passes.checkOut(
      pass.id,
      lot.id,
      actor.userId,
      'SELF',
      now,
    );
  }

  const passPath = z.object({ id: z.uuid() });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/passes/{id}/self-check-in',
      tags: ['passes'],
      ...secured,
      request: { params: passPath, body: { ...json(SelfCheckRequestSchema), required: true } },
      responses: {
        200: { description: 'Pass checked in (1 vehicle at a time)', ...json(SelfCheckResultSchema) },
      },
    }),
    async (c) => c.json(await passSelfCheck(c, c.req.valid('param').id, 'CHECK_IN'), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/passes/{id}/self-check-out',
      tags: ['passes'],
      ...secured,
      request: { params: passPath, body: { ...json(SelfCheckRequestSchema), required: true } },
      responses: {
        200: { description: 'Pass checked out', ...json(SelfCheckResultSchema) },
      },
    }),
    async (c) => c.json(await passSelfCheck(c, c.req.valid('param').id, 'CHECK_OUT'), 200),
  );

  return app;
}
