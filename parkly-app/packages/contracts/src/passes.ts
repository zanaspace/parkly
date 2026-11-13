import { z } from 'zod';
import { CheckoutSchema } from './bookings.js';
import { QuoteLineSchema } from './discovery.js';

/** FR-PASS-001..005: Monthly passes (30-day period, one vehicle in lot at a time, up to 2 swaps/month). */
export const PassStatusSchema = z.enum(['HELD', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REVOKED']);

export const CreatePassRequestSchema = z.object({
  lotId: z.uuid(),
  vehicleId: z.uuid(),
  /** YYYY-MM-DD in Africa/Lagos (inclusive start of the 30-day pass period). */
  startDate: z.iso.date(),
  source: z.enum(['MOBILE', 'WEB']).default('MOBILE'),
  returnTo: z.url().max(500).optional(),
});

export const PassSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: PassStatusSchema,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  holdExpiresAt: z.iso.datetime().nullable(),
  lot: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    addressLine: z.string(),
    area: z.string().nullable().default(null),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null),
    entranceNotes: z.string().nullable().default(null),
    selfCheckIn: z.boolean().default(false),
    requiresVerifiedDriver: z.boolean().default(false),
  }),
  vehicle: z.object({
    id: z.uuid(),
    plate: z.string(),
  }),
  driverVerified: z.boolean().default(false),
  priceKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  totalKobo: z.number().int(),
  lines: z.array(QuoteLineSchema),
  swapsUsed: z.number().int(),
  swapsRemaining: z.number().int(),
  /** Signed offline pass QR ticket (`t: 'P'`) while ACTIVE. */
  qrToken: z.string().nullable(),
  /** True when the pass currently has an OPEN parking session in the lot. */
  inLot: z.boolean().default(false),
  checkedInAt: z.iso.datetime().nullable().default(null),
  renewedFromId: z.uuid().nullable().default(null),
  createdAt: z.iso.datetime(),
});

export const CreatePassResponseSchema = z.object({
  pass: PassSchema,
  payment: CheckoutSchema,
});

export const VerifyPassPaymentResponseSchema = z.object({
  payment: CheckoutSchema,
  pass: PassSchema,
});

export const PassListQuerySchema = z.object({
  status: z.enum(['active', 'past']).default('active'),
});

export const PassListSchema = z.object({
  items: z.array(PassSchema),
});

export const SwapPassVehicleRequestSchema = z.object({
  vehicleId: z.uuid(),
});

export const RenewPassRequestSchema = z.object({
  /** Optional override start date (defaults to day after current periodEnd, or today if already expired). */
  startDate: z.iso.date().optional(),
  vehicleId: z.uuid().optional(),
  source: z.enum(['MOBILE', 'WEB']).default('MOBILE'),
  returnTo: z.url().max(500).optional(),
});

export const JoinPassWaitlistRequestSchema = z
  .object({
    lotId: z.uuid(),
    desiredStartDate: z.iso.date().optional(),
    desiredStart: z.iso.date().optional(),
  })
  .refine((d) => d.desiredStartDate || d.desiredStart, {
    message: 'desiredStartDate or desiredStart required',
  });

export const PassWaitlistResponseSchema = z.object({
  id: z.uuid(),
  lotId: z.uuid(),
  desiredStartDate: z.iso.date().optional(),
  desiredStart: z.iso.date().optional(),
  status: z.enum(['WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED']),
  createdAt: z.iso.datetime(),
});

export type PassStatus = z.infer<typeof PassStatusSchema>;
export type CreatePassRequest = z.input<typeof CreatePassRequestSchema>;
export type Pass = z.infer<typeof PassSchema>;
export type CreatePassResponse = z.infer<typeof CreatePassResponseSchema>;
export type VerifyPassPaymentResponse = z.infer<typeof VerifyPassPaymentResponseSchema>;
export type PassList = z.infer<typeof PassListSchema>;
export type SwapPassVehicleRequest = z.infer<typeof SwapPassVehicleRequestSchema>;
export type RenewPassRequest = z.input<typeof RenewPassRequestSchema>;
export type JoinPassWaitlistRequest = z.infer<typeof JoinPassWaitlistRequestSchema>;
export type PassWaitlistResponse = z.infer<typeof PassWaitlistResponseSchema>;
