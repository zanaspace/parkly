import { z } from 'zod';
import { BookingStatusSchema } from './bookings.js';

/** FR-ADM-002: one box for a booking code, phone, plate or payment reference. */
export const SupportSearchQuerySchema = z.object({
  q: z.string().trim().min(4).max(100),
});

/** A booking as support sees it before any reveal: first name, masked phone, plate. */
export const SupportBookingSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: BookingStatusSchema,
  lotId: z.uuid(),
  lotName: z.string(),
  operatorName: z.string(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  plate: z.string().nullable(),
  totalKobo: z.number().int(),
  driver: z.object({
    firstName: z.string().nullable(),
    /** "+234 *** *** 4567"; the full number only through reveal (audited). */
    phoneMasked: z.string().nullable(),
    hasEmail: z.boolean(),
  }),
  createdAt: z.iso.datetime(),
});

export const SupportSearchResponseSchema = z.object({
  /** How the query was read, so the page can say "Phone +234 *** *** 4567: 3 bookings". */
  kind: z.enum(['CODE', 'REFERENCE', 'PHONE', 'PLATE', 'INVALID']),
  items: z.array(SupportBookingSchema),
});

export const TimelineEventSchema = z.object({
  at: z.iso.datetime().nullable(),
  type: z.enum(['STATUS', 'PAYMENT', 'REFUND', 'CHECK_IN', 'CHECK_OUT', 'OVERSTAY']),
  label: z.string(),
  amountKobo: z.number().int().nullable(),
  detail: z.string().nullable(),
});

export const SupportBookingDetailSchema = z.object({
  booking: SupportBookingSchema,
  overstay: z
    .object({
      status: z.enum(['NONE', 'DUE', 'PAID', 'UNPAID', 'WAIVED']),
      minutes: z.number().int(),
      amountKobo: z.number().int(),
    })
    .nullable(),
  timeline: z.array(TimelineEventSchema),
  /** What staff can still refund (paid, less refunds and pending requests). */
  refundableKobo: z.number().int().nonnegative(),
  /** Over this, a staff refund needs a second finance admin. */
  refundApprovalThresholdKobo: z.number().int(),
  /** What support may still refund here (their per-booking limit less staff refunds so far). */
  supportRefundLeftKobo: z.number().int().nonnegative(),
});

/** Show the driver's full phone or email; the reason goes to the audit log. */
export const RevealContactRequestSchema = z.object({
  field: z.enum(['phone', 'email']),
  reason: z.string().trim().min(5).max(200),
});
export const RevealContactResponseSchema = z.object({
  field: z.enum(['phone', 'email']),
  value: z.string().nullable(),
});

export type SupportSearchQuery = z.infer<typeof SupportSearchQuerySchema>;
export type SupportBooking = z.infer<typeof SupportBookingSchema>;
export type SupportSearchResponse = z.infer<typeof SupportSearchResponseSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type SupportBookingDetail = z.infer<typeof SupportBookingDetailSchema>;
export type RevealContactRequest = z.infer<typeof RevealContactRequestSchema>;
export type RevealContactResponse = z.infer<typeof RevealContactResponseSchema>;

/** FR-ADM-003: staff cancel a booking under the normal policy; the reason is audited. */
export const AdminCancelRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export const AdminCancelResponseSchema = z.object({
  status: BookingStatusSchema,
  refundKobo: z.number().int().nonnegative(),
});

/** Refunds staff choose; automatic ones (policy, late money) have their own reasons. */
export const AdminRefundReasonSchema = z.enum([
  'OPS_GOODWILL',
  'LOT_UNAVAILABLE',
  'DUPLICATE',
  'OTHER',
]);

export const AdminRefundRequestSchema = z.object({
  amountKobo: z.number().int().positive(),
  reason: AdminRefundReasonSchema,
  note: z.string().trim().min(5).max(500),
});

export const RefundRequestSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  bookingCode: z.string(),
  amountKobo: z.number().int(),
  reason: z.string(),
  note: z.string(),
  status: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'FAILED']),
  requestedBy: z.uuid(),
  requestedByName: z.string().nullable(),
  decidedBy: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

/** Issued straight away, or waiting for a second finance admin (over the threshold). */
export const AdminRefundResponseSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('ISSUED'), amountKobo: z.number().int() }),
  z.object({ outcome: z.literal('PENDING_APPROVAL'), request: RefundRequestSchema }),
]);

export const RefundRequestListQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'FAILED']).optional(),
  bookingId: z.uuid().optional(),
});
export const RefundRequestListSchema = z.object({ items: z.array(RefundRequestSchema) });

export const ApproveRefundRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export const RejectRefundRequestSchema = z.object({
  note: z.string().trim().min(5).max(500),
});

export type AdminCancelRequest = z.infer<typeof AdminCancelRequestSchema>;
export type AdminCancelResponse = z.infer<typeof AdminCancelResponseSchema>;
export type AdminRefundReason = z.infer<typeof AdminRefundReasonSchema>;
export type AdminRefundRequest = z.infer<typeof AdminRefundRequestSchema>;
export type AdminRefundResponse = z.infer<typeof AdminRefundResponseSchema>;
export type RefundRequest = z.infer<typeof RefundRequestSchema>;
export type RefundRequestList = z.infer<typeof RefundRequestListSchema>;
