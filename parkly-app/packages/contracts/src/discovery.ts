import { z } from 'zod';
import { VerificationItemSchema } from './admin-lots.js';
import {
  AmenitySchema,
  LatLngSchema,
  OpeningDaySchema,
  ProductSchema,
  VehicleTypeSchema,
} from './lots.js';
import { OperatorTypeSchema } from './operators.js';

/** Doc 02 §4 quote lines, as shown to drivers. */
export const QuoteLineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('HOURLY_DAY'),
    date: z.iso.date(),
    minutes: z.number().int(),
    amountKobo: z.number().int(),
    capped: z.boolean(),
  }),
  z.object({ kind: z.literal('DAY'), date: z.iso.date(), amountKobo: z.number().int() }),
  z.object({
    kind: z.literal('MONTH'),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    amountKobo: z.number().int(),
  }),
  z.object({ kind: z.literal('SERVICE_FEE'), amountKobo: z.number().int() }),
]);

/**
 * The server's price for a window (doc 00 §3.4: clients display it, never
 * compute it). Commission and the operator's share are internal.
 */
export const QuoteSchema = z.object({
  product: ProductSchema,
  priceKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  totalKobo: z.number().int(),
  lines: z.array(QuoteLineSchema),
});

const WindowFields = {
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  product: z.enum(['HOURLY', 'DAILY']).default('HOURLY'),
};

/** FR-LOT-101: `GET /v1/lots/search`. Times on the 15-minute grid. */
export const LotSearchQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().int().min(100).max(5000).default(2000),
  ...WindowFields,
  /** Comma-separated amenities every result must have, e.g. `CCTV,GUARD`. */
  amenities: z
    .string()
    .max(200)
    .optional()
    .transform((v, ctx) => {
      const list = (v ?? '').split(',').filter(Boolean);
      for (const a of list)
        if (!AmenitySchema.safeParse(a).success) {
          ctx.addIssue({ code: 'custom', message: `Unknown amenity ${a}` });
          return z.NEVER;
        }
      return list as z.infer<typeof AmenitySchema>[];
    }),
  sort: z.enum(['distance', 'price']).default('distance'),
});

export const LotSearchResultSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  type: OperatorTypeSchema,
  addressLine: z.string(),
  area: z.string().nullable(),
  location: LatLngSchema,
  distanceM: z.number().int(),
  amenities: z.array(AmenitySchema),
  photoUrl: z.url().nullable(),
  /** Open for the whole window; when false the card says "Closed at that time". */
  isOpen: z.boolean(),
  availableCount: z.number().int(),
  isAvailable: z.boolean(),
  quote: QuoteSchema,
});
export const LotSearchResponseSchema = z.object({
  items: z.array(LotSearchResultSchema),
  radiusM: z.number().int(),
});

export const PublicPriceSchema = z.object({
  product: ProductSchema,
  hourlyRateKobo: z.number().int().nullable(),
  minMinutes: z.number().int(),
  dailyCapKobo: z.number().int().nullable(),
  dailyRateKobo: z.number().int().nullable(),
  monthlyRateKobo: z.number().int().nullable(),
});

/** D-13 / public lot page: only LIVE, listable lots (doc 00 non-negotiable 2). */
export const PublicLotSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  type: OperatorTypeSchema,
  operatorName: z.string(),
  description: z.string().nullable(),
  addressLine: z.string(),
  area: z.string().nullable(),
  lga: z.string().nullable(),
  location: LatLngSchema,
  entranceNotes: z.string().nullable(),
  capacityBookable: z.number().int(),
  amenities: z.array(AmenitySchema),
  vehicleTypes: z.array(VehicleTypeSchema),
  openingHours: z.array(OpeningDaySchema),
  photos: z.array(z.object({ url: z.url() })),
  prices: z.array(PublicPriceSchema),
  /** Doc 03 §1.3 verified sheet: what was checked and when. */
  verification: z.object({
    permitNumberLast4: z.string(),
    verifiedOn: z.iso.date(),
    checksPassed: z.array(VerificationItemSchema),
  }),
});

export const LotAvailabilityQuerySchema = z.object(WindowFields);
export const LotAvailabilitySchema = z.object({
  isOpen: z.boolean(),
  availableCount: z.number().int(),
  isAvailable: z.boolean(),
});

export const QuoteRequestSchema = z.object({
  product: ProductSchema,
  startAt: z.iso.datetime(),
  /** Ignored for MONTHLY (30 days from the start date). */
  endAt: z.iso.datetime(),
});

export type Quote = z.infer<typeof QuoteSchema>;
export type QuoteLine = z.infer<typeof QuoteLineSchema>;
export type LotSearchQuery = z.input<typeof LotSearchQuerySchema>;
export type LotSearchResult = z.infer<typeof LotSearchResultSchema>;
export type LotSearchResponse = z.infer<typeof LotSearchResponseSchema>;
export type PublicLot = z.infer<typeof PublicLotSchema>;
export type PublicPrice = z.infer<typeof PublicPriceSchema>;
export type LotAvailability = z.infer<typeof LotAvailabilitySchema>;
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;
