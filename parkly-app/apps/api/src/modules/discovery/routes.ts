import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  LotAvailabilityQuerySchema,
  LotAvailabilitySchema,
  LotSearchQuerySchema,
  LotSearchResponseSchema,
  PublicLotSchema,
  QuoteRequestSchema,
  QuoteSchema,
  type LotSearchResult,
  type OpeningDay,
  type PublicLot,
  type Quote,
} from '@parkly/contracts';
import {
  availableInWindow,
  checkSearchWindow,
  isOpenDuring,
  type BookingWindowLimits,
} from '@parkly/domain/availability';
import {
  quote as priceQuote,
  type PricingSettings,
  type Quote as DomainQuote,
} from '@parkly/domain/pricing';
import { lagosDateKey, slotStartsBetween } from '@parkly/domain/time';
import type { AppDeps } from '../../app.js';
import { ApiError } from '../../lib/errors.js';
import type { LiveLotRow, OpeningHourRow, RatePlanRow, SlotRow, Store } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
/** Doc 02 §6.3: at most this many results per search, nearest first. */
const SEARCH_LIMIT = 50;
/** Doc 03 §1.3: up to 8 photos on the lot page. */
const MAX_PUBLIC_PHOTOS = 8;

/** Doc 02 §8 defaults, overridden by `platform_settings`. */
export async function loadSettings(store: Store) {
  const get = async (key: string, fallback: number) =>
    (await store.settings.get<number>(key)) ?? fallback;
  const [serviceFeeKobo, serviceFeeMaxDurationMin, minLeadMin, maxAdvanceDays, maxDurationHours] =
    await Promise.all([
      get('fees.service_fee_kobo', 10_000),
      get('fees.service_fee_max_duration_min', 1440),
      get('booking.min_lead_min', 0),
      get('booking.max_advance_days', 30),
      get('booking.max_duration_hours', 24),
    ]);
  const limits: BookingWindowLimits = { minLeadMin, maxAdvanceDays, maxDurationHours };
  return { fees: { serviceFeeKobo, serviceFeeMaxDurationMin }, limits };
}

/** Drivers see the price, fee and total; commission and the operator's share stay internal. */
export const toPublicQuote = (q: DomainQuote): Quote => ({
  product: q.product,
  priceKobo: q.priceKobo,
  serviceFeeKobo: q.serviceFeeKobo,
  totalKobo: q.totalKobo,
  lines: q.lines.filter(
    (l): l is Quote['lines'][number] => l.kind !== 'EXTENSION' && l.kind !== 'OVERSTAY',
  ),
});

export const toOpeningDay = (h: OpeningHourRow): OpeningDay =>
  h.is24h
    ? { weekday: h.weekday, is24h: true }
    : { weekday: h.weekday, is24h: false, opensAt: h.opensAt ?? '', closesAt: h.closesAt ?? '' };

const groupBy = <T extends { lotId: string }>(rows: T[]) => {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(r.lotId, [...(map.get(r.lotId) ?? []), r]);
  return map;
};

/**
 * Driver discovery (FR-LOT-101/102, doc 02 §6.3). Public: no sign-in, only
 * LIVE lots that pass the listing gate, prices computed here from the
 * domain pricing engine.
 */
export function discoveryRoutes(deps: AppDeps) {
  const app = new OpenAPIHono();

  function windowOrThrow(
    input: { startAt: string; endAt: string; product: 'HOURLY' | 'DAILY' },
    limits: BookingWindowLimits,
    code: 'SEARCH_INVALID_WINDOW' | 'BOOKING_WINDOW_INVALID',
  ) {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    const problem = checkSearchWindow({
      startAt,
      endAt,
      now: deps.now(),
      limits,
      product: input.product,
      allowTestStays: deps.config.testShortStays,
    });
    if (problem)
      throw new ApiError(
        code,
        'Pick a time on the quarter hour, from now up to 30 days ahead, of at most 24 hours',
      );
    return { startAt, endAt };
  }

  /** Price, opening and free spaces of one lot for the window, or null if it doesn't sell the product. */
  function evaluate(
    lot: LiveLotRow,
    ctx: {
      product: 'HOURLY' | 'DAILY';
      startAt: Date;
      endAt: Date;
      fees: Omit<PricingSettings, 'commissionBps'>;
      plans: RatePlanRow[];
      hours: OpeningHourRow[];
      slots: SlotRow[];
    },
  ) {
    const plan = ctx.plans.find((p) => p.product === ctx.product);
    if (!plan) return null;
    const priced = priceQuote({
      ratePlan: plan,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      settings: { ...ctx.fees, commissionBps: lot.commissionBps },
      allowTestStays: deps.config.testShortStays,
    });
    // e.g. a 1-hour search at a lot whose minimum stay is 2 hours.
    if (!priced.ok) return null;
    const isOpen = isOpenDuring({
      hours: ctx.hours.map(toOpeningDay),
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      product: ctx.product,
    });
    const availableCount = isOpen
      ? availableInWindow({
          slots: slotStartsBetween(ctx.startAt, ctx.endAt),
          rows: ctx.slots,
          capacityBookable: lot.capacityBookable,
        })
      : 0;
    return { quote: priced.quote, isOpen, availableCount };
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/lots/search',
      tags: ['lots'],
      request: { query: LotSearchQuerySchema },
      responses: { 200: { description: 'Lots near the point', ...json(LotSearchResponseSchema) } },
    }),
    async (c) => {
      const q = c.req.valid('query');
      const { fees, limits } = await loadSettings(deps.store);
      const { startAt, endAt } = windowOrThrow(q, limits, 'SEARCH_INVALID_WINDOW');
      const today = lagosDateKey(deps.now());
      const lots = (
        await deps.store.lots.searchLive({
          lat: q.lat,
          lng: q.lng,
          radiusM: q.radiusM,
          today,
          limit: SEARCH_LIMIT,
        })
      ).filter((l) => q.amenities.every((a) => l.amenities.includes(a)));
      const ids = lots.map((l) => l.id);
      const [plans, hours, slots, photos] = await Promise.all([
        deps.store.ratePlans.activeFor(ids),
        deps.store.lots.openingHoursFor(ids),
        deps.store.inventory.slots(ids, startAt, endAt),
        deps.store.lotPhotos.publicFor(ids),
      ]);
      const [plansBy, hoursBy, slotsBy, photosBy] = [
        groupBy(plans),
        groupBy(hours),
        groupBy(slots),
        groupBy(photos),
      ];

      const items: LotSearchResult[] = [];
      for (const lot of lots) {
        const result = evaluate(lot, {
          product: q.product,
          startAt,
          endAt,
          fees,
          plans: plansBy.get(lot.id) ?? [],
          hours: hoursBy.get(lot.id) ?? [],
          slots: slotsBy.get(lot.id) ?? [],
        });
        if (!result) continue;
        const photo = photosBy.get(lot.id)?.[0];
        items.push({
          id: lot.id,
          slug: lot.slug,
          name: lot.name,
          type: lot.type,
          addressLine: lot.addressLine,
          area: lot.area,
          location: lot.location,
          distanceM: lot.distanceM,
          amenities: lot.amenities as LotSearchResult['amenities'],
          photoUrl: photo
            ? deps.storage.publicUrl({ bucket: 'lot-photos-public', path: photo.path })
            : null,
          isOpen: result.isOpen,
          availableCount: result.availableCount,
          isAvailable: result.availableCount > 0,
          quote: toPublicQuote(result.quote),
        });
      }
      // Doc 03 §1.2: distance then price by default.
      const byDistance = (a: LotSearchResult, b: LotSearchResult) => a.distanceM - b.distanceM;
      const byPrice = (a: LotSearchResult, b: LotSearchResult) =>
        a.quote.totalKobo - b.quote.totalKobo;
      items.sort((a, b) =>
        q.sort === 'price' ? byPrice(a, b) || byDistance(a, b) : byDistance(a, b) || byPrice(a, b),
      );
      return c.json({ items, radiusM: q.radiusM }, 200);
    },
  );

  async function liveLot(idOrSlug: string): Promise<LiveLotRow> {
    const lot = await deps.store.lots.findLive(idOrSlug, lagosDateKey(deps.now()));
    if (!lot) throw new ApiError('LOT_NOT_FOUND');
    return lot;
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/lots/{idOrSlug}',
      tags: ['lots'],
      request: { params: z.object({ idOrSlug: z.string().min(1).max(120) }) },
      responses: { 200: { description: 'Public lot page', ...json(PublicLotSchema) } },
    }),
    async (c) => {
      const lot = await liveLot(c.req.valid('param').idOrSlug);
      const today = lagosDateKey(deps.now());
      const [hours, plans, photos, permit, visit] = await Promise.all([
        deps.store.lots.openingHours(lot.id),
        deps.store.ratePlans.activeFor([lot.id]),
        deps.store.lotPhotos.publicFor([lot.id]),
        deps.store.permits.currentApproved(lot.id, today),
        deps.store.verifications.currentApproved(lot.id, today),
      ]);
      // findLive already proved both exist; this keeps the types honest.
      if (!permit || !visit) throw new ApiError('LOT_NOT_FOUND');
      const body: PublicLot = {
        id: lot.id,
        slug: lot.slug,
        name: lot.name,
        type: lot.type,
        operatorName: lot.operatorName,
        description: lot.description,
        addressLine: lot.addressLine,
        area: lot.area,
        lga: lot.lga,
        location: lot.location,
        entranceNotes: lot.entranceNotes,
        capacityBookable: lot.capacityBookable,
        amenities: lot.amenities as PublicLot['amenities'],
        vehicleTypes: lot.vehicleTypes as PublicLot['vehicleTypes'],
        openingHours: hours.map(toOpeningDay),
        photos: photos.slice(0, MAX_PUBLIC_PHOTOS).map((p) => ({
          url: deps.storage.publicUrl({ bucket: 'lot-photos-public', path: p.path }),
        })),
        prices: plans.map((p) => ({
          product: p.product,
          hourlyRateKobo: p.hourlyRateKobo,
          minMinutes: p.minMinutes,
          dailyCapKobo: p.dailyCapKobo,
          dailyRateKobo: p.dailyRateKobo,
          monthlyRateKobo: p.monthlyRateKobo,
        })),
        verification: {
          // Doc 03 §1.3: the permit number masked except the last 4.
          permitNumberLast4: permit.permitNumber.slice(-4),
          verifiedOn: lagosDateKey(visit.inspectedAt),
          checksPassed: visit.items.filter((i) => i.result === 'PASS').map((i) => i.item),
        },
      };
      // Doc 01 §9: public, no personal data; the edge may cache it briefly.
      c.header('cache-control', 'public, s-maxage=60');
      return c.json(body, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/lots/{lotId}/availability',
      tags: ['lots'],
      request: { params: z.object({ lotId: z.uuid() }), query: LotAvailabilityQuerySchema },
      responses: { 200: { description: 'Free spaces', ...json(LotAvailabilitySchema) } },
    }),
    async (c) => {
      const lot = await liveLot(c.req.valid('param').lotId);
      const q = c.req.valid('query');
      const { limits } = await loadSettings(deps.store);
      const { startAt, endAt } = windowOrThrow(q, limits, 'SEARCH_INVALID_WINDOW');
      const [hours, slots] = await Promise.all([
        deps.store.lots.openingHours(lot.id),
        deps.store.inventory.slots([lot.id], startAt, endAt),
      ]);
      const isOpen = isOpenDuring({
        hours: hours.map(toOpeningDay),
        startAt,
        endAt,
        product: q.product,
      });
      const availableCount = isOpen
        ? availableInWindow({
            slots: slotStartsBetween(startAt, endAt),
            rows: slots,
            capacityBookable: lot.capacityBookable,
          })
        : 0;
      return c.json({ isOpen, availableCount, isAvailable: availableCount > 0 }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/lots/{lotId}/quote',
      tags: ['lots'],
      request: {
        params: z.object({ lotId: z.uuid() }),
        body: { ...json(QuoteRequestSchema), required: true },
      },
      responses: { 200: { description: 'Price for the window', ...json(QuoteSchema) } },
    }),
    async (c) => {
      const lot = await liveLot(c.req.valid('param').lotId);
      const body = c.req.valid('json');
      const { fees, limits } = await loadSettings(deps.store);
      const plan = (await deps.store.ratePlans.activeFor([lot.id])).find(
        (p) => p.product === body.product,
      );
      if (!plan) throw new ApiError('LOT_NOT_BOOKABLE', 'This lot does not sell that option');
      let startAt = new Date(body.startAt);
      let endAt = new Date(body.endAt);
      if (body.product === 'MONTHLY') {
        if (lagosDateKey(startAt) < lagosDateKey(deps.now()))
          throw new ApiError('BOOKING_WINDOW_INVALID', 'A pass can’t start in the past');
      } else {
        ({ startAt, endAt } = windowOrThrow(
          { ...body, product: body.product },
          limits,
          'BOOKING_WINDOW_INVALID',
        ));
        const hours = await deps.store.lots.openingHours(lot.id);
        if (
          !isOpenDuring({ hours: hours.map(toOpeningDay), startAt, endAt, product: body.product })
        )
          throw new ApiError('BOOKING_OUTSIDE_OPENING_HOURS');
      }
      const priced = priceQuote({
        ratePlan: plan,
        startAt,
        endAt,
        settings: { ...fees, commissionBps: lot.commissionBps },
        allowTestStays: deps.config.testShortStays,
      });
      if (!priced.ok)
        throw new ApiError(
          'PRICING_INVALID_DURATION',
          `The minimum stay here is ${plan.minMinutes} minutes`,
        );
      return c.json(toPublicQuote(priced.quote), 200);
    },
  );

  return app;
}
