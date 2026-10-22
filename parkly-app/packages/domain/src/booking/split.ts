import { assertKobo, mulDivRoundHalfUp, type Kobo } from '../money/money.js';

/** `fees.commission_bps_default` range (doc 02 §8). */
export const MIN_COMMISSION_BPS = 1000;
export const MAX_COMMISSION_BPS = 1500;

export type PaymentSplit = {
  /** What the driver pays: price + service fee. */
  amountKobo: Kobo;
  commissionKobo: Kobo;
  /**
   * Paystack `transaction_charge`: the flat amount the main (Parkly) account
   * keeps; the operator's subaccount gets the rest.
   */
  transactionChargeKobo: Kobo;
  operatorAmountKobo: Kobo;
  /** `payments.platform_amount_kobo`: commission + service fee. */
  platformAmountKobo: Kobo;
};

/**
 * How one booking payment divides between the operator and Parkly (doc 01 §5.2).
 * Commission rounds exactly as in the quote, so the two always agree.
 */
export function paymentSplit(input: {
  priceKobo: Kobo;
  serviceFeeKobo: Kobo;
  commissionBps: number;
}): PaymentSplit {
  const { commissionBps } = input;
  if (
    !Number.isSafeInteger(commissionBps) ||
    commissionBps < MIN_COMMISSION_BPS ||
    commissionBps > MAX_COMMISSION_BPS
  ) {
    throw new RangeError(`Invalid commission bps: ${commissionBps}`);
  }
  const priceKobo = assertKobo(input.priceKobo);
  const serviceFeeKobo = assertKobo(input.serviceFeeKobo);
  if (priceKobo === 0) throw new RangeError('A booking payment needs a price above zero');

  const commissionKobo = mulDivRoundHalfUp(priceKobo, commissionBps, 10_000);
  const platformAmountKobo = commissionKobo + serviceFeeKobo;
  return {
    amountKobo: priceKobo + serviceFeeKobo,
    commissionKobo,
    transactionChargeKobo: platformAmountKobo,
    operatorAmountKobo: priceKobo - commissionKobo,
    platformAmountKobo,
  };
}
