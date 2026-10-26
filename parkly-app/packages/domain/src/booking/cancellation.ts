import { assertKobo, mulDivRoundHalfUp, type Kobo } from '../money/money.js';
import type { BookingActor, BookingStatus } from './booking.js';
import {
  LEDGER_ACCOUNTS,
  operatorPayable,
  providerClearing,
  type BookingPayment,
  type JournalLine,
} from './ledger.js';
import { paymentSplit } from './split.js';

export type RefundReason =
  | 'DRIVER_CANCEL'
  | 'HOLD_EXPIRED'
  | 'LOT_UNAVAILABLE'
  | 'OPS_GOODWILL'
  | 'DUPLICATE'
  | 'PERMIT_SUSPENSION'
  | 'OTHER';

export type CancellationSettings = {
  /** `booking.free_cancellation_lead_min`: minutes before start time that allow free cancellation (default 30). */
  freeCancellationLeadMin: number;
};

export type CancellationInput = {
  startAt: Date;
  now: Date;
  status: BookingStatus;
  priceKobo: Kobo;
  serviceFeeKobo: Kobo;
  totalKobo: Kobo;
  actor: BookingActor;
  overrideRefundKobo?: Kobo;
  overrideReason?: RefundReason;
  settings: CancellationSettings;
};

export type CancellationResult = {
  cancellable: boolean;
  isFreeCancellation: boolean;
  refundKobo: Kobo;
  refundPriceKobo: Kobo;
  refundServiceFeeKobo: Kobo;
  reason: RefundReason;
  code?: string;
};

const MINUTE_MS = 60_000;

/**
 * Evaluates whether a booking can be cancelled and calculates refund amounts (FR-BOOK-006).
 *
 * Rules:
 * 1. Only PENDING_PAYMENT or CONFIRMED bookings can be cancelled.
 * 2. PENDING_PAYMENT cancels with 0 refund (hold simply releases).
 * 3. For CONFIRMED bookings cancelled by DRIVER:
 *    - If `now <= startAt - freeCancellationLeadMin`: 100% refund of parking price and service fee.
 *    - If `now > startAt - freeCancellationLeadMin`: late cancellation -> 0 refund, space released.
 * 4. ADMIN actor can provide an override refund amount and reason (e.g., ops goodwill).
 */
export function cancellationPolicy(input: CancellationInput): CancellationResult {
  const { status, actor, now, startAt, priceKobo, serviceFeeKobo, totalKobo, settings } = input;

  if (status !== 'PENDING_PAYMENT' && status !== 'CONFIRMED') {
    return {
      cancellable: false,
      isFreeCancellation: false,
      refundKobo: 0 as Kobo,
      refundPriceKobo: 0 as Kobo,
      refundServiceFeeKobo: 0 as Kobo,
      reason: input.overrideReason ?? 'DRIVER_CANCEL',
      code: 'BOOKING_NOT_CANCELLABLE',
    };
  }

  // PENDING_PAYMENT hold release
  if (status === 'PENDING_PAYMENT') {
    return {
      cancellable: true,
      isFreeCancellation: false,
      refundKobo: 0 as Kobo,
      refundPriceKobo: 0 as Kobo,
      refundServiceFeeKobo: 0 as Kobo,
      reason: 'DRIVER_CANCEL',
    };
  }

  // Admin override takes precedence if specified
  if (actor === 'ADMIN' && input.overrideRefundKobo !== undefined) {
    const refundKobo = assertKobo(input.overrideRefundKobo);
    const refundPriceKobo = Math.min(refundKobo, priceKobo) as Kobo;
    const refundServiceFeeKobo = Math.max(0, refundKobo - refundPriceKobo) as Kobo;
    return {
      cancellable: true,
      isFreeCancellation: false,
      refundKobo,
      refundPriceKobo,
      refundServiceFeeKobo,
      reason: input.overrideReason ?? 'OPS_GOODWILL',
    };
  }

  // Free cancellation window calculation: up to lead time before start
  const cutoffTime = startAt.getTime() - settings.freeCancellationLeadMin * MINUTE_MS;
  const isFree = now.getTime() <= cutoffTime;

  if (isFree) {
    return {
      cancellable: true,
      isFreeCancellation: true,
      refundKobo: totalKobo,
      refundPriceKobo: priceKobo,
      refundServiceFeeKobo: serviceFeeKobo,
      reason: input.overrideReason ?? (actor === 'DRIVER' ? 'DRIVER_CANCEL' : 'OPS_GOODWILL'),
    };
  }

  // Admin without explicit refund amount gets full refund override if requested
  if (actor === 'ADMIN') {
    return {
      cancellable: true,
      isFreeCancellation: false,
      refundKobo: totalKobo,
      refundPriceKobo: priceKobo,
      refundServiceFeeKobo: serviceFeeKobo,
      reason: input.overrideReason ?? 'OPS_GOODWILL',
    };
  }

  // Late cancellation by driver: cancels space with 0 refund
  return {
    cancellable: true,
    isFreeCancellation: false,
    refundKobo: 0 as Kobo,
    refundPriceKobo: 0 as Kobo,
    refundServiceFeeKobo: 0 as Kobo,
    reason: 'DRIVER_CANCEL',
  };
}

/**
 * Creates double-entry journal lines reversing the original payment split for a cancellation refund (doc 02 §2.7).
 */
export function cancellationRefundJournal(input: {
  payment: BookingPayment;
  refundPriceKobo: Kobo;
  refundServiceFeeKobo: Kobo;
}): JournalLine[] {
  const { payment, refundPriceKobo, refundServiceFeeKobo } = input;
  const totalRefundKobo = (refundPriceKobo + refundServiceFeeKobo) as Kobo;

  if (totalRefundKobo <= 0) return [];

  // Calculate proportional commission & operator payable reversal on the refunded price
  const split = paymentSplit({
    priceKobo: refundPriceKobo,
    serviceFeeKobo: refundServiceFeeKobo,
    commissionBps: payment.commissionBps,
  });

  const lines: JournalLine[] = [];

  // Debit operator payable to reduce our debt to the operator
  if (split.operatorAmountKobo > 0) {
    lines.push({
      account: operatorPayable(payment.operatorId),
      direction: 'DEBIT',
      amountKobo: split.operatorAmountKobo,
    });
  }

  // Debit platform commission to forfeit earned commission
  if (split.commissionKobo > 0) {
    lines.push({
      account: LEDGER_ACCOUNTS.COMMISSION,
      direction: 'DEBIT',
      amountKobo: split.commissionKobo,
    });
  }

  // Debit platform service fee if refunded
  if (refundServiceFeeKobo > 0) {
    lines.push({
      account: LEDGER_ACCOUNTS.SERVICE_FEE,
      direction: 'DEBIT',
      amountKobo: refundServiceFeeKobo,
    });
  }

  // Credit provider clearing (or refunds clearing) for the money leaving the provider balance
  lines.push({
    account: providerClearing(payment.provider),
    direction: 'CREDIT',
    amountKobo: totalRefundKobo,
  });

  return lines;
}
