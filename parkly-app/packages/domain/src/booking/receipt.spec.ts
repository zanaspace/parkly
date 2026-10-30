import { describe, expect, it } from 'vitest';
import { includedVatKobo, receiptNumber } from './receipt.js';

describe('receipt numbers (FR-BOOK-009)', () => {
  it('pads the per-operator sequence', () => {
    expect(receiptNumber(1)).toBe('R-000001');
    expect(receiptNumber(123_456)).toBe('R-123456');
    expect(receiptNumber(1_234_567)).toBe('R-1234567');
  });
});

describe('VAT included in a price (when VAT is switched on)', () => {
  it('takes the VAT out of a VAT-inclusive total', () => {
    // ₦1,075 at 7.5% includes ₦75 VAT.
    expect(includedVatKobo(107_500, 750)).toBe(7_500);
    // Rounded to the nearest kobo, half up.
    expect(includedVatKobo(110_000, 750)).toBe(7_674);
    expect(includedVatKobo(0, 750)).toBe(0);
    expect(includedVatKobo(110_000, 0)).toBe(0);
  });
});
