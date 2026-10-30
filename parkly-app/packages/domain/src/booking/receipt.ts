import { mulDivRoundHalfUp, type Kobo } from '../money/money.js';

/** FR-BOOK-009: the receipt number from the operator's sequence, e.g. R-000123. */
export function receiptNumber(seq: number): string {
  return `R-${String(seq).padStart(6, '0')}`;
}

/**
 * The VAT inside a VAT-inclusive amount: total × rate ÷ (1 + rate). Prices
 * already include it, so switching VAT on changes what the receipt shows,
 * never what the driver pays (`fees.vat_enabled`, `fees.vat_rate_bps`).
 */
export function includedVatKobo(totalKobo: number, rateBps: number): Kobo {
  if (totalKobo <= 0 || rateBps <= 0) return 0 as Kobo;
  return mulDivRoundHalfUp(totalKobo, rateBps, 10_000 + rateBps) as Kobo;
}
