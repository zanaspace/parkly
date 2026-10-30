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
  source: z.enum(['MOBILE', 'WEB']).default('MOBILE'),
  /**
   * Website only: where Paystack sends the driver back after paying. Must be
   * on one of Parkly's own sites (the API's allowed origins).
   */
  returnTo: z.url().max(500).optional(),
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
    area: z.string().nullable().default(null),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null),
    entranceNotes: z.string().nullable().default(null),
    contactPhone: z.string().nullable().default(null),
    /** The owner allows drivers to check themselves in here (ADR 0016). Defaults to off so an
     * app newer than the live API still reads its bookings. */
    selfCheckIn: z.boolean().default(false),
  }),
  vehicle: z.object({ id: z.uuid(), plate: z.string() }),
  priceKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  totalKobo: z.number().int(),
  lines: z.array(QuoteLineSchema),
  /**
   * Signed offline ticket for the gate (doc 01 §7), only while CONFIRMED or
   * CHECKED_IN. Show it as a QR code, with the booking code beside it.
   */
  qrToken: z.string().nullable(),
  /**
   * The overstay price for this car park (ADR 0016), shown on the ticket:
   * per started 15 minutes after the grace. Null when the lot has no
   * hourly or daily price to base it on.
   */
  overstay: z
    .object({ graceMin: z.number().int(), per15Kobo: z.number().int() })
    .nullable()
    // Null when an older API leaves it out (an app can be newer than the live API).
    .default(null),
  /**
   * The car's stay, once the gate has checked it in (driver timer, ADR 0016).
   * Overstay is the server's figure: live while the car is still in after
   * end + grace, final after check-out. Clients only display it.
   */
  stay: z
    .object({
      checkedInAt: z.iso.datetime().nullable(),
      checkedOutAt: z.iso.datetime().nullable(),
      overstayMinutes: z.number().int(),
      overstayKobo: z.number().int(),
      /**
       * DUE while accruing or owed, UNPAID after 24 h (blocks new bookings),
       * PAID or WAIVED once settled. Optional: older APIs leave it out.
       */
      overstayStatus: z.enum(['NONE', 'DUE', 'PAID', 'UNPAID', 'WAIVED']).optional(),
    })
    .nullable()
    .default(null),
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

/** FR-BOOK-005: `POST /v1/bookings/{id}/extensions`. Times on the 15-minute grid. */
export const ExtendBookingRequestSchema = z.object({
  newEndAt: z.iso.datetime(),
  returnTo: z.url().max(500).optional(),
});

export const BookingExtensionSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  startAt: z.iso.datetime(),
  newEndAt: z.iso.datetime(),
  addedMinutes: z.number().int(),
  priceKobo: z.number().int(),
  status: BookingStatusSchema,
  createdAt: z.iso.datetime(),
});

export const ExtendBookingResponseSchema = z.object({
  extension: BookingExtensionSchema,
  booking: BookingSchema,
  payment: CheckoutSchema.nullable(),
});

/**
 * FR-BOOK-005: `GET /v1/bookings/{id}/extensions/options`. How far this stay
 * can be extended right now, so clients only offer durations the server will
 * accept. All times are on the 15-minute grid.
 */
export const ExtensionOptionsSchema = z.object({
  /** The booking is in a state that allows extending (confirmed or checked in). */
  extendable: z.boolean(),
  /** Latest new end time allowed; null when no extension is possible. */
  extendableUntil: z.iso.datetime().nullable(),
  /** The car park closes here before the longest stay allowed is reached. */
  closesAt: z.iso.datetime().nullable(),
  /** When it opens again after `closesAt` (within a week), else null. */
  reopensAt: z.iso.datetime().nullable(),
  /** The longest stay allowed caps the end here (booking start + 24h for hourly). */
  maxEndAt: z.iso.datetime(),
});

/** FR-BOOK-006: `POST /v1/bookings/{id}/cancel`. */
export const CancelBookingRequestSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const CancelBookingResponseSchema = z.object({
  booking: BookingSchema,
  refundKobo: z.number().int(),
  isFreeCancellation: z.boolean(),
});

/** FR-BOOK-008: `POST /v1/bookings/{id}/overstay/pay`. */
export const OverstayPayRequestSchema = z.object({
  returnTo: z.url().max(500).optional(),
});

export const OverstayPayResponseSchema = z.object({
  payment: CheckoutSchema,
  overstayMinutes: z.number().int(),
  amountKobo: z.number().int(),
});

export const BookingReceiptPaymentSchema = z.object({
  reference: z.string(),
  kind: z.enum(['BOOKING', 'EXTENSION', 'OVERSTAY', 'PASS']),
  amountKobo: z.number().int(),
  paidAt: z.iso.datetime().nullable(),
  channel: z.string().nullable(),
  cardLast4: z.string().nullable(),
  status: PaymentStatusSchema,
});

export const BookingReceiptRefundSchema = z.object({
  amountKobo: z.number().int(),
  status: z.string(),
  reason: z.string(),
  createdAt: z.iso.datetime(),
});

/** A receipt link for a browser, signed for one booking and valid for minutes (gap review S-2). */
export const ReceiptLinkSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type ReceiptLink = z.infer<typeof ReceiptLinkSchema>;

/** One paid charge on the receipt: the booking, each extension, the overstay (FR-BOOK-009). */
export const ReceiptChargeSchema = z.object({
  kind: z.enum(['BOOKING', 'EXTENSION', 'OVERSTAY', 'PASS']),
  reference: z.string(),
  amountKobo: z.number().int(),
  paidAt: z.iso.datetime().nullable(),
});

/**
 * FR-BOOK-009: a stored receipt. Its contents are frozen when issued; a new
 * charge or refund re-issues it as the next revision under the same number,
 * so two views of one revision are identical (gap review L-5).
 */
export const BookingReceiptSchema = z.object({
  receiptNumber: z.string(),
  revision: z.number().int(),
  bookingId: z.uuid(),
  bookingCode: z.string(),
  status: BookingStatusSchema,
  /** When the receipt was first issued; `revisedAt` when this revision was. */
  issuedAt: z.iso.datetime(),
  revisedAt: z.iso.datetime(),
  /** The operator selling the parking. */
  issuer: z.object({ name: z.string() }),
  lot: z.object({
    id: z.uuid(),
    name: z.string(),
    addressLine: z.string(),
    area: z.string().nullable(),
    /** The LASPA permit the lot operated under when this revision was issued. */
    permitNumber: z.string().nullable(),
  }),
  vehicle: z.object({
    plate: z.string(),
  }),
  driver: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phoneLast4: z.string().nullable(),
  }),
  product: z.enum(['HOURLY', 'DAILY']),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  durationMinutes: z.number().int(),
  priceKobo: z.number().int(),
  serviceFeeKobo: z.number().int(),
  totalKobo: z.number().int(),
  /** The original booking's price breakdown. */
  lines: z.array(QuoteLineSchema),
  /** Every paid charge; they add up to `totals.chargedKobo`. */
  charges: z.array(ReceiptChargeSchema),
  totals: z.object({
    chargedKobo: z.number().int(),
    refundedKobo: z.number().int(),
    refundPendingKobo: z.number().int(),
  }),
  /** Only when VAT is switched on (`fees.vat_enabled`); prices include it. */
  vat: z
    .object({
      rateBps: z.number().int(),
      amountKobo: z.number().int(),
      number: z.string().nullable(),
    })
    .nullable(),
  payments: z.array(BookingReceiptPaymentSchema),
  refunds: z.array(BookingReceiptRefundSchema),
});

export type BookingStatus = z.infer<typeof BookingStatusSchema>;
/** What a client sends (defaults applied by the API). */
export type CreateBookingRequest = z.input<typeof CreateBookingRequestSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type Checkout = z.infer<typeof CheckoutSchema>;
export type CreateBookingResponse = z.infer<typeof CreateBookingResponseSchema>;
export type BookingList = z.infer<typeof BookingListSchema>;
export type VerifyPaymentResponse = z.infer<typeof VerifyPaymentResponseSchema>;
export type ExtendBookingRequest = z.input<typeof ExtendBookingRequestSchema>;
export type BookingExtension = z.infer<typeof BookingExtensionSchema>;
export type ExtendBookingResponse = z.infer<typeof ExtendBookingResponseSchema>;
export type ExtensionOptions = z.infer<typeof ExtensionOptionsSchema>;
export type CancelBookingRequest = z.input<typeof CancelBookingRequestSchema>;
export type CancelBookingResponse = z.infer<typeof CancelBookingResponseSchema>;
export type OverstayPayRequest = z.input<typeof OverstayPayRequestSchema>;
export type OverstayPayResponse = z.infer<typeof OverstayPayResponseSchema>;
export type BookingReceipt = z.infer<typeof BookingReceiptSchema>;

/** FR-BOOK-008: an overstay left unpaid past 24 hours blocks new bookings until paid or waived. */
export const UnpaidOverstaySchema = z.object({
  unpaid: z
    .object({
      bookingId: z.uuid(),
      bookingCode: z.string(),
      lotName: z.string(),
      amountKobo: z.number().int(),
    })
    .nullable(),
});

/** Support's view of a booking found by code (admin console, gap review L-4). */
export const AdminBookingSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: BookingStatusSchema,
  lotName: z.string(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  plate: z.string().nullable().optional(),
  totalKobo: z.number().int().optional(),
  overstay: z
    .object({
      status: z.enum(['NONE', 'DUE', 'PAID', 'UNPAID', 'WAIVED']),
      minutes: z.number().int(),
      amountKobo: z.number().int(),
    })
    .nullable(),
});

export const AdminBookingListSchema = z.object({
  items: z.array(AdminBookingSchema),
});

/** Ops waive an overstay as goodwill (e.g. a broken barrier); the reason is audited. */
export const WaiveOverstayRequestSchema = z.object({
  reason: z.string().trim().min(5, 'Say why, in a few words').max(500),
});

export type UnpaidOverstay = z.infer<typeof UnpaidOverstaySchema>;
export type AdminBooking = z.infer<typeof AdminBookingSchema>;
export type AdminBookingList = z.infer<typeof AdminBookingListSchema>;
export type WaiveOverstayRequest = z.infer<typeof WaiveOverstayRequestSchema>;
