import { z } from 'zod';
import { QuoteLineSchema } from './discovery.js';

/** Doc 00 §3.6. */
export const BookingStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
]);

/** FR-BOOK-001: `POST /v1/bookings` (Idempotency-Key required). Times on the 15-minute grid. */
export const CreateBookingRequestSchema = z.object({
  lotId: z.uuid(),
  vehicleId: z.uuid(),
  product: z.enum(['HOURLY', 'DAILY']).default('HOURLY'),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
});

/** A driver's booking. Prices are the server's snapshot taken when it was made. */
export const BookingSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: BookingStatusSchema,
  product: z.enum(['HOURLY', 'DAILY']),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  /** Pay before this or the space is released (PENDING_PAYMENT only). */
  holdExpiresAt: z.iso.datetime().nullable(),
  lot: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    addressLine: z.string(),
  }),
  vehicle: z.object({ id: z.uuid(), plate: z.string() }),
  priceKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  totalKobo: z.number().int(),
  lines: z.array(QuoteLineSchema),
  createdAt: z.iso.datetime(),
});

export const PaymentStatusSchema = z.enum([
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'ABANDONED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

export const CheckoutSchema = z.object({
  /** Also the provider reference. */
  reference: z.uuid(),
  status: PaymentStatusSchema,
  /** Open this to pay (Paystack checkout). */
  authorizationUrl: z.url().nullable(),
  expiresAt: z.iso.datetime().nullable(),
});

export const CreateBookingResponseSchema = z.object({
  booking: BookingSchema,
  payment: CheckoutSchema,
});

/** FR-BOOK-004: upcoming (not yet ended), past (ended, cancelled or expired). */
export const BookingListQuerySchema = z.object({
  status: z.enum(['upcoming', 'past']).default('upcoming'),
});
export const BookingListSchema = z.object({ items: z.array(BookingSchema) });

/** `POST /v1/payments/{reference}/verify`: the app asks the server to check with the provider. */
export const VerifyPaymentResponseSchema = z.object({
  payment: CheckoutSchema,
  booking: BookingSchema,
});

export type BookingStatus = z.infer<typeof BookingStatusSchema>;
export type CreateBookingRequest = z.infer<typeof CreateBookingRequestSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type Checkout = z.infer<typeof CheckoutSchema>;
export type CreateBookingResponse = z.infer<typeof CreateBookingResponseSchema>;
export type BookingList = z.infer<typeof BookingListSchema>;
export type VerifyPaymentResponse = z.infer<typeof VerifyPaymentResponseSchema>;
