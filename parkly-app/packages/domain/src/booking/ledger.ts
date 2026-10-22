import type { Kobo } from '../money/money.js';
import { paymentSplit } from './split.js';

/**
 * Double-entry postings (doc 02 §2.7). Each journal's debits equal its credits;
 * the database checks the same invariant again at commit.
 */

export const LEDGER_ACCOUNTS = {
  DRIVER_RECEIVABLE: 'DRIVER_RECEIVABLE',
  COMMISSION: 'PLATFORM_REVENUE_COMMISSION',
  SERVICE_FEE: 'PLATFORM_REVENUE_SERVICE_FEE',
  PAYMENT_FEES: 'PAYMENT_FEES_EXPENSE',
  REFUNDS_CLEARING: 'REFUNDS_CLEARING',
} as const;

export type PaymentProvider = 'PAYSTACK' | 'FLUTTERWAVE' | 'FAKE';
export type AccountType = 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE';
export type Direction = 'DEBIT' | 'CREDIT';

export const providerClearing = (provider: PaymentProvider) => `PROVIDER_CLEARING:${provider}`;
export const operatorPayable = (operatorId: string) => `OPERATOR_PAYABLE:${operatorId}`;

export function accountType(code: string): AccountType {
  if (code.startsWith('PROVIDER_CLEARING:') || code === LEDGER_ACCOUNTS.DRIVER_RECEIVABLE) {
    return 'ASSET';
  }
  if (code.startsWith('OPERATOR_PAYABLE:') || code === LEDGER_ACCOUNTS.REFUNDS_CLEARING) {
    return 'LIABILITY';
  }
  if (code === LEDGER_ACCOUNTS.COMMISSION || code === LEDGER_ACCOUNTS.SERVICE_FEE) {
    return 'REVENUE';
  }
  if (code === LEDGER_ACCOUNTS.PAYMENT_FEES) return 'EXPENSE';
  throw new RangeError(`Unknown ledger account: ${code}`);
}

export type JournalLine = { account: string; direction: Direction; amountKobo: Kobo };

/** At least one debit and one credit, all amounts positive whole kobo, both sides equal. */
export function isBalanced(lines: readonly JournalLine[]): boolean {
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amountKobo) || line.amountKobo <= 0) return false;
    if (line.direction === 'DEBIT') debits += line.amountKobo;
    else credits += line.amountKobo;
  }
  return debits > 0 && debits === credits;
}

export type BookingPayment = {
  provider: PaymentProvider;
  operatorId: string;
  priceKobo: Kobo;
  serviceFeeKobo: Kobo;
  commissionBps: number;
};

const line = (account: string, direction: Direction, amountKobo: Kobo): JournalLine[] =>
  amountKobo > 0 ? [{ account, direction, amountKobo }] : [];

/** Money in from the provider, owed on to the operator and earned by Parkly. */
export function bookingPaymentJournal(payment: BookingPayment): JournalLine[] {
  const split = paymentSplit(payment);
  return [
    ...line(providerClearing(payment.provider), 'DEBIT', split.amountKobo),
    ...line(operatorPayable(payment.operatorId), 'CREDIT', split.operatorAmountKobo),
    ...line(LEDGER_ACCOUNTS.COMMISSION, 'CREDIT', split.commissionKobo),
    ...line(LEDGER_ACCOUNTS.SERVICE_FEE, 'CREDIT', payment.serviceFeeKobo),
  ];
}

/** The provider's fee from verify, borne by Parkly (`fees.fee_bearer = PLATFORM`). */
export function providerFeeJournal(input: {
  provider: PaymentProvider;
  feesKobo: Kobo;
}): JournalLine[] {
  if (input.feesKobo <= 0) return [];
  return [
    ...line(LEDGER_ACCOUNTS.PAYMENT_FEES, 'DEBIT', input.feesKobo),
    ...line(providerClearing(input.provider), 'CREDIT', input.feesKobo),
  ];
}

/** A full refund reverses the payment journal line by line (hold expired, cancelled before payment). */
export function refundJournal(payment: BookingPayment): JournalLine[] {
  return bookingPaymentJournal(payment).map((l) => ({
    ...l,
    direction: l.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
  }));
}
