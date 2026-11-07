import { describe, expect, it } from 'vitest';
import { percentToBps } from './commission';

describe('commission form input', () => {
  it('reads percent to basis points without floating point', () => {
    expect(percentToBps('10')).toBe(1000);
    expect(percentToBps('12.5')).toBe(1250);
    expect(percentToBps('12.25%')).toBe(1225);
    expect(percentToBps(' 15 ')).toBe(1500);
    expect(percentToBps('14.07')).toBe(1407);
  });

  it('refuses anything outside 10–15% or not a plain number', () => {
    expect(percentToBps('9.99')).toBeNull();
    expect(percentToBps('15.01')).toBeNull();
    expect(percentToBps('12.345')).toBeNull();
    expect(percentToBps('abc')).toBeNull();
    expect(percentToBps('')).toBeNull();
  });
});
