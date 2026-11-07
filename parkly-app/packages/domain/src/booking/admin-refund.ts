import type { Kobo } from '../money/money.js';
import type { PaymentStatus } from './payment.js';

/**
 * FR-ADM-003: refunds staff choose (goodwill, a lot problem, a duplicate),
 * as opposed to the automatic ones (cancellation policy, late money).
 */
export const ADMIN_REFUND_REASONS = [
  'OPS_GOODWILL',
  'LOT_UNAVAILABLE',
  'DUPLICATE',
  'OTHER',
] as const;
export type AdminRefundReason = (typeof ADMIN_REFUND_REASONS)[number];

/** Default `refund.approval_threshold_kobo`: over ₦50,000 needs a second finance admin. */
export const DEFAULT_REFUND_APPROVAL_THRESHOLD_KOBO = 5_000_000 as Kobo;

const REFUNDABLE: readonly PaymentStatus[] = ['SUCCEEDED', 'PARTIALLY_REFUNDED'];

/**
 * What staff can still give back on a booking: what was paid for the booking
 * and extensions, less refunds not failed, less refunds waiting for approval.
 * Overstay is left out: it's waived, not refunded (FR-BOOK-008).
 */
export function refundableKobo(input: {
  payments: readonly { kind?: string; status: PaymentStatus; amountKobo: number }[];
  refunds: readonly { status: string; amountKobo: number }[];
  pendingRequestsKobo?: number;
}): Kobo {
  const paid = input.payments
    .filter((p) => (p.kind ?? 'BOOKING') !== 'OVERSTAY' && REFUNDABLE.includes(p.status))
    .reduce((n, p) => n + p.amountKobo, 0);
  const given = input.refunds
    .filter((r) => r.status !== 'FAILED')
    .reduce((n, r) => n + r.amountKobo, 0);
  return Math.max(0, paid - given - (input.pendingRequestsKobo ?? 0)) as Kobo;
}

/**
 * How a chosen refund comes off the booking: the parking price first (split
 * with the operator at the booking's commission), then Parkly's service fee.
 */
export function splitAdminRefund(
  amountKobo: Kobo,
  booking: { priceKobo: number; serviceFeeKobo: number },
): { refundPriceKobo: Kobo; refundServiceFeeKobo: Kobo } {
  const refundPriceKobo = Math.min(amountKobo, booking.priceKobo) as Kobo;
  const refundServiceFeeKobo = Math.min(
    amountKobo - refundPriceKobo,
    booking.serviceFeeKobo,
  ) as Kobo;
  return { refundPriceKobo, refundServiceFeeKobo };
}

/** Default `refund.support_limit_kobo`: support may give back up to ₦10,000 per booking (doc 03 §4.4). */
export const DEFAULT_SUPPORT_REFUND_LIMIT_KOBO = 1_000_000 as Kobo;

/**
 * Refunds staff chose on a booking so far, not failed. Only those carry a
 * staff note; policy refunds (cancellation) and late-money refunds don't.
 */
export function staffRefundedKobo(
  refunds: readonly { status: string; amountKobo: number; note?: string | null }[],
): Kobo {
  return refunds
    .filter((r) => r.note && r.status !== 'FAILED')
    .reduce((n, r) => n + r.amountKobo, 0) as Kobo;
}

/**
 * What support may still refund on a booking: their per-booking limit, less
 * refunds staff already chose, and never more than is refundable.
 */
export function supportRefundLeftKobo(input: {
  limitKobo: number;
  staffRefundedKobo: number;
  refundableKobo: number;
}): Kobo {
  return Math.max(
    0,
    Math.min(input.limitKobo - input.staffRefundedKobo, input.refundableKobo),
  ) as Kobo;
}

/** Over the threshold, a refund waits for a second finance admin (FR-ADM-003). */
export const needsSecondApproval = (amountKobo: number, thresholdKobo: number): boolean =>
  amountKobo > thresholdKobo;
