import {
  type addOnDecision,
  bookingPaymentJournal,
  providerFeeJournal,
  refundJournal,
  type BookingStatus,
  type ConfirmDecision,
  type JournalLine,
  type PaymentStatus,
} from '@parkly/domain/booking';
import type { VerifiedCharge } from '../providers/index.js';
import type { BookingRow, PaymentRow } from './types.js';

/** Everything one settlement changes; MemoryStore and DrizzleStore both apply it as is. */
export type SettlePlan = {
  payment: {
    status?: PaymentStatus;
    paidAt?: Date | null;
    feesKobo?: number | null;
    channel?: string | null;
    cardLast4?: string | null;
    cardBrand?: string | null;
    failureCode?: string;
  } | null;
  booking: { from: BookingStatus; to: BookingStatus; reason: string } | null;
  /** convert: held → booked. release: give the held space back. */
  slots: 'convert' | 'release' | null;
  journals: JournalLine[][];
  refund: {
    amountKobo: number;
    reason: 'HOLD_EXPIRED' | 'DRIVER_CANCEL' | 'DUPLICATE' | 'OTHER';
  } | null;
  /** Extension or overstay: confirm the extension or mark the overstay paid. */
  applyAddOn?: boolean;
};

const NOTHING: SettlePlan = {
  payment: null,
  booking: null,
  slots: null,
  journals: [],
  refund: null,
};

/**
 * The rows a successful charge writes: payment details plus the ledger journals (doc 02 §2.7).
 * A booking payment carries the booking's price and fee; an extension or overstay
 * payment carries only its own amount, with no service fee.
 */
function grossOf(booking: BookingRow, payment: PaymentRow) {
  const addOn = payment.kind === 'EXTENSION' || payment.kind === 'OVERSTAY';
  return {
    provider: payment.provider,
    operatorId: payment.operatorId,
    priceKobo: addOn ? payment.amountKobo : booking.priceKobo,
    serviceFeeKobo: addOn ? 0 : booking.serviceFeeKobo,
    commissionBps: booking.commissionBps,
  };
}

function paid(charge: VerifiedCharge, booking: BookingRow, payment: PaymentRow) {
  const journals = [bookingPaymentJournal(grossOf(booking, payment))];
  const fee = providerFeeJournal({ provider: payment.provider, feesKobo: charge.feesKobo ?? 0 });
  if (fee.length > 0) journals.push(fee);
  return {
    payment: {
      status: 'SUCCEEDED' as const,
      paidAt: charge.paidAt,
      feesKobo: charge.feesKobo,
      channel: charge.channel,
      cardLast4: charge.cardLast4,
      cardBrand: charge.cardBrand,
    },
    journals,
  };
}

/**
 * Money taken and handed straight back: the payment journal, then its reversal
 * so operator payable and revenue return to zero (gap review P-12). The
 * provider's fee stays an expense.
 */
function refunded(
  charge: VerifiedCharge,
  booking: BookingRow,
  payment: PaymentRow,
  reason: NonNullable<SettlePlan['refund']>['reason'],
): SettlePlan {
  const p = paid(charge, booking, payment);
  return {
    ...p,
    journals: [...p.journals, refundJournal(grossOf(booking, payment))],
    booking: null,
    slots: null,
    refund: { amountKobo: payment.amountKobo, reason },
  };
}

/** What `payments.settle` writes for a decision. REACQUIRE has already taken its space. */
export function settlePlan(
  decision: ConfirmDecision,
  charge: VerifiedCharge,
  booking: BookingRow,
  payment: PaymentRow,
): SettlePlan {
  switch (decision) {
    case 'CONFIRM':
      return {
        ...paid(charge, booking, payment),
        booking: { from: booking.status, to: 'CONFIRMED', reason: 'payment.succeeded' },
        slots: 'convert',
        refund: null,
      };
    case 'REACQUIRE_AND_CONFIRM':
      return {
        ...paid(charge, booking, payment),
        booking: { from: booking.status, to: 'CONFIRMED', reason: 'payment.late' },
        slots: null,
        refund: null,
      };
    case 'REFUND_HOLD_EXPIRED':
      return refunded(charge, booking, payment, 'HOLD_EXPIRED');
    case 'REFUND_CANCELLED':
      return refunded(charge, booking, payment, 'DRIVER_CANCEL');
    case 'FAIL':
      return {
        payment: { status: 'FAILED', failureCode: charge.status.slice(0, 64) },
        booking:
          booking.status === 'PENDING_PAYMENT'
            ? { from: 'PENDING_PAYMENT', to: 'EXPIRED', reason: 'payment.failed' }
            : null,
        slots: booking.status === 'PENDING_PAYMENT' ? 'release' : null,
        journals: [],
        refund: null,
      };
    case 'REFUND_NOT_APPLIED':
      return refunded(charge, booking, payment, 'OTHER');
    // Money for a checkout we had closed, or a second payment for a booking that
    // is already paid: give it back rather than keep it (gap review P-9).
    case 'NEEDS_REVIEW':
      return refunded(charge, booking, payment, 'DUPLICATE');
    case 'AMOUNT_MISMATCH':
      return { ...NOTHING, payment: { failureCode: 'AMOUNT_MISMATCH' } };
    case 'WAIT':
    case 'NOOP':
      return NOTHING;
  }
}

/**
 * What `payments.settle` writes for an extension or overstay payment (gap review
 * P-2, P-3, P-6). The booking itself never changes status here.
 */
export function addOnSettlePlan(
  decision: ReturnType<typeof addOnDecision>,
  charge: VerifiedCharge,
  booking: BookingRow,
  payment: PaymentRow,
): SettlePlan {
  switch (decision) {
    case 'CONFIRM':
      return {
        ...paid(charge, booking, payment),
        booking: null,
        slots: null,
        refund: null,
        applyAddOn: true,
      };
    case 'FAIL':
      return { ...NOTHING, payment: { status: 'FAILED', failureCode: charge.status.slice(0, 64) } };
    default:
      return settlePlan(decision, charge, booking, payment);
  }
}
