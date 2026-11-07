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
