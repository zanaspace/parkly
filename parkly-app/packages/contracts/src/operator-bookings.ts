import { z } from 'zod';
import { BookingStatusSchema } from './bookings.js';

const LagosDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Longest date range one list or export may cover (FR-OPS-002). */
export const OPERATOR_BOOKINGS_MAX_DAYS = 93;
/** Most rows one CSV export may hold; narrow the filters for more. */
export const OPERATOR_BOOKINGS_EXPORT_MAX_ROWS = 10_000;

/**
 * FR-OPS-002 filters. `from`/`to` are Lagos dates, both included, matched
 * against the booking's start. Statuses are comma-separated.
 */
export const OperatorBookingQuerySchema = z.object({
  from: LagosDate,
  to: LagosDate,
  lotId: z.uuid().optional(),
  status: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      const parts = s.split(',').map((p) => p.trim());
      const parsed = z.array(BookingStatusSchema).safeParse(parts);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'Unknown booking status' });
        return z.NEVER;
      }
      return parsed.data;
    }),
});

export const OperatorBookingListQuerySchema = OperatorBookingQuerySchema.extend({
  /** From the previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** One booking as the operator sees it: driver shown by first name and plate only. */
export const OperatorBookingSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  lotId: z.uuid(),
  lotName: z.string(),
  status: BookingStatusSchema,
  product: z.enum(['HOURLY', 'DAILY']),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  plate: z.string(),
  driverFirstName: z.string().nullable(),
  /** Parking price as booked (kobo), before Parkly's commission. */
  priceKobo: z.number().int(),
  /** Everything the driver paid for this booking so far, service fee included (kobo). */
  totalKobo: z.number().int(),
  checkInAt: z.iso.datetime().nullable(),
  checkOutAt: z.iso.datetime().nullable(),
  overstayStatus: z.enum(['NONE', 'DUE', 'PAID', 'UNPAID', 'WAIVED']),
  overstayAmountKobo: z.number().int(),
  /** Checked out by the system 12 h after the end, not at the gate (gap review G-9). */
  autoClosed: z.boolean(),
});

export const OperatorBookingListSchema = z.object({
  items: z.array(OperatorBookingSchema),
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: z.string().nullable(),
});

export type OperatorBookingQuery = z.infer<typeof OperatorBookingQuerySchema>;
export type OperatorBooking = z.infer<typeof OperatorBookingSchema>;
export type OperatorBookingList = z.infer<typeof OperatorBookingListSchema>;
