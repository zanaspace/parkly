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

/** Over the threshold, a refund waits for a second finance admin (FR-ADM-003). */
export const needsSecondApproval = (amountKobo: number, thresholdKobo: number): boolean =>
  amountKobo > thresholdKobo;
