import type { Kobo } from '../money/money.js';
import type { BookingStatus } from './booking.js';

/** Payment lifecycle (doc 00 §3.6, doc 02 §3.2). Refund states live here, not on bookings. */

export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'ABANDONED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  INITIATED: ['PENDING', 'SUCCEEDED', 'FAILED'],
  PENDING: ['SUCCEEDED', 'FAILED', 'ABANDONED'],
  SUCCEEDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  // A second partial refund keeps the status.
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [],
  ABANDONED: [],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The payment status after one more refund; refunds never exceed the amount (doc 02 §2.7). */
export function statusAfterRefund(input: {
  amountKobo: Kobo;
  refundedKobo: Kobo;
  refundKobo: Kobo;
}):
  | { ok: true; status: 'PARTIALLY_REFUNDED' | 'REFUNDED' }
  | { ok: false; code: 'REFUND_EXCEEDS_PAYMENT' } {
  const total = input.refundedKobo + input.refundKobo;
  if (input.refundKobo <= 0 || total > input.amountKobo) {
    return { ok: false, code: 'REFUND_EXCEEDS_PAYMENT' };
  }
  return { ok: true, status: total === input.amountKobo ? 'REFUNDED' : 'PARTIALLY_REFUNDED' };
}

/** The provider's verify answer, already parsed by the adapter. */
export type VerifyResult = {
  /** Paystack `data.status`: success, failed, reversed, abandoned, ongoing, pending, … */
  status: string;
  amountKobo: Kobo;
  currency: string;
};

export type ConfirmInput = {
  payment: { status: PaymentStatus; amountKobo: Kobo };
  verify: VerifyResult;
  bookingStatus: BookingStatus;
  /** A space is still free for the booking window (checked under lock). */
  capacityAvailable: boolean;
};

export type ConfirmDecision =
  /** Payment SUCCEEDED; booking CONFIRMED; held → booked; ledger posted. */
  | 'CONFIRM'
  /** Hold had expired but a space is free: take it again, then confirm. */
  | 'REACQUIRE_AND_CONFIRM'
  /** Payment SUCCEEDED, then refunded in full with reason HOLD_EXPIRED. */
  | 'REFUND_HOLD_EXPIRED'
  /** Driver cancelled before the money arrived: refund in full. */
  | 'REFUND_CANCELLED'
  /** Payment FAILED; the hold runs out on its own. */
  | 'FAIL'
  /** Provider not finished yet; try again later. */
  | 'WAIT'
  /** Already handled: a duplicate webhook or a verify race. */
  | 'NOOP'
  /** Never confirm; raise a `payment.amount_mismatch` incident. */
  | 'AMOUNT_MISMATCH'
  /** States disagree (e.g. money for a payment we marked failed); ops look at it. */
  | 'NEEDS_REVIEW';

const SETTLED: readonly PaymentStatus[] = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
const FAILED: readonly string[] = ['failed', 'reversed'];

/**
 * What `confirmPayment` does with a verify answer (doc 02 §7.5, doc 01 §5.2).
 * The caller holds the payment row lock, so the same answer twice is a NOOP.
 */
export function confirmDecision(input: ConfirmInput): ConfirmDecision {
  const { payment, verify } = input;
  if (SETTLED.includes(payment.status)) return 'NOOP';
  if (FAILED.includes(verify.status)) {
    return payment.status === 'FAILED' || payment.status === 'ABANDONED' ? 'NOOP' : 'FAIL';
  }
  if (verify.status !== 'success') return 'WAIT';
  if (verify.amountKobo !== payment.amountKobo || verify.currency !== 'NGN') {
    return 'AMOUNT_MISMATCH';
  }
  if (payment.status === 'FAILED' || payment.status === 'ABANDONED') return 'NEEDS_REVIEW';

  switch (input.bookingStatus) {
    case 'PENDING_PAYMENT':
      return 'CONFIRM';
    case 'EXPIRED':
      return input.capacityAvailable ? 'REACQUIRE_AND_CONFIRM' : 'REFUND_HOLD_EXPIRED';
    case 'CANCELLED':
      return 'REFUND_CANCELLED';
    default:
      return 'NEEDS_REVIEW';
  }
}
