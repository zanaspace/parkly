import {
  bookingPaymentJournal,
  providerFeeJournal,
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
  refund: { amountKobo: number; reason: 'HOLD_EXPIRED' | 'DRIVER_CANCEL' } | null;
};

const NOTHING: SettlePlan = {
  payment: null,
  booking: null,
  slots: null,
  journals: [],
  refund: null,
};

/** The rows a successful charge writes: payment details plus the ledger journals (doc 02 §2.7). */
function paid(charge: VerifiedCharge, booking: BookingRow, payment: PaymentRow) {
  const journals = [
    bookingPaymentJournal({
      provider: payment.provider,
      operatorId: payment.operatorId,
      priceKobo: booking.priceKobo,
      serviceFeeKobo: booking.serviceFeeKobo,
      commissionBps: booking.commissionBps,
    }),
  ];
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
    case 'REFUND_CANCELLED':
      return {
        ...paid(charge, booking, payment),
        booking: null,
        slots: null,
        refund: {
          amountKobo: payment.amountKobo,
          reason: decision === 'REFUND_HOLD_EXPIRED' ? 'HOLD_EXPIRED' : 'DRIVER_CANCEL',
        },
      };
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
    case 'AMOUNT_MISMATCH':
      return { ...NOTHING, payment: { failureCode: 'AMOUNT_MISMATCH' } };
    case 'WAIT':
    case 'NOOP':
    case 'NEEDS_REVIEW':
      return NOTHING;
  }
}
