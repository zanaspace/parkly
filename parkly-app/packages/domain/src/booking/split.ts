import { assertKobo, mulDivRoundHalfUp, type Kobo } from '../money/money.js';

/**
 * 10–15 % is the app rule (`fees.commission_bps_default`, doc 02 §8), but a
 * SUPER_ADMIN may override it, so only 0–100 % is enforced here, as in the DB.
 */
const MAX_COMMISSION_BPS = 10_000;

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
    commissionBps < 0 ||
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
