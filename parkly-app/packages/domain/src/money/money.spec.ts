import { describe, expect, it } from 'vitest';
import { assertKobo, formatNaira, mulDivRoundHalfUp, nairaToKobo } from './money.js';

describe('assertKobo', () => {
  it.each([0, 1, 150_000, Number.MAX_SAFE_INTEGER])('accepts %s', (v) => {
    expect(assertKobo(v)).toBe(v);
  });
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s',
    (v) => {
      expect(() => assertKobo(v)).toThrow(RangeError);
    },
  );
});

describe('nairaToKobo', () => {
  it.each([
    ['0', 0],
    ['1500', 150_000],
    ['1,500', 150_000],
    ['1500.5', 150_050],
    ['1500.05', 150_005],
    [' ₦2,000.00 ', 200_000],
    [750, 75_000],
    [0.1, 10],
    [333.33, 33_333],
  ] as const)('converts %j to %d kobo', (input, kobo) => {
    expect(nairaToKobo(input)).toBe(kobo);
  });
  it.each(['', 'abc', '1.234', '-5', '1..2', '1,50,0.0.0'])('rejects %j', (input) => {
    expect(() => nairaToKobo(input)).toThrow(RangeError);
  });
  it('rejects numbers with more than 2 decimals or negatives', () => {
    expect(() => nairaToKobo(1.234)).toThrow(RangeError);
    expect(() => nairaToKobo(-1)).toThrow(RangeError);
  });
});

describe('mulDivRoundHalfUp', () => {
  // Values from doc 02 §4 worked examples.
  it.each([
    [75_000, 15, 60, 18_750],
    [33_300, 15, 60, 8_325],
    [41_625, 1_250, 10_000, 5_203], // 5203.125 → 5203
    [1, 1, 2, 1], // 0.5 → 1 (half up)
    [3, 1, 2, 2], // 1.5 → 2
    [5, 1, 4, 1], // 1.25 → 1
    [0, 99, 7, 0],
  ])('round_half_up(%d × %d / %d) = %d', (a, b, c, r) => {
    expect(mulDivRoundHalfUp(a, b, c)).toBe(r);
  });
  it('is exact for large values where floats would drift', () => {
    expect(mulDivRoundHalfUp(9_007_199_254_740, 1_500, 10_000)).toBe(1_351_079_888_211);
  });
  it('rejects a zero divisor, negatives and non-integers', () => {
    expect(() => mulDivRoundHalfUp(1, 1, 0)).toThrow(RangeError);
    expect(() => mulDivRoundHalfUp(-1, 1, 1)).toThrow(RangeError);
    expect(() => mulDivRoundHalfUp(1, 1.5, 1)).toThrow(RangeError);
  });
});

describe('formatNaira', () => {
  it.each([
    [0, '₦0'],
    [10_000, '₦100'],
    [150_000, '₦1,500'],
    [150_050, '₦1,500.50'],
    [150_005, '₦1,500.05'],
    [123_456_789, '₦1,234,567.89'],
  ])('formats %d kobo as %s', (kobo, text) => {
    expect(formatNaira(kobo)).toBe(text);
  });
});
