import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateBookingCode, isBookingCode } from './booking-code.js';

// Deterministic byte source for tests.
const bytesFrom = (values: number[]) => {
  let i = 0;
  return (n: number) => Uint8Array.from({ length: n }, () => values[i++ % values.length] ?? 0);
};

describe('booking codes', () => {
  it('uses an unambiguous 31-character alphabet (no 0/O, 1/I/L)', () => {
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    expect(CODE_ALPHABET).toHaveLength(31);
  });

  it('formats as PK- plus 6 characters', () => {
    expect(generateBookingCode(bytesFrom([0, 1, 2, 3, 4, 5]))).toBe('PK-ABCDEF');
  });

  it('rejects biased bytes (>= 248) instead of using modulo', () => {
    // 248 and 255 must be skipped; 30 maps to the last alphabet character.
    expect(generateBookingCode(bytesFrom([248, 255, 30, 30, 30, 30, 30, 30]))).toBe('PK-999999');
  });

  it('produces valid codes with the default secure source', () => {
    for (let i = 0; i < 200; i++) expect(isBookingCode(generateBookingCode())).toBe(true);
  });

  it.each([
    ['PK-7HQ4MZ', true],
    ['pk-7hq4mz', false],
    ['PK-7HQ4M0', false],
    ['PK-7HQ4M', false],
    ['XX-7HQ4MZ', false],
  ])('isBookingCode(%j) = %s', (code, ok) => {
    expect(isBookingCode(code)).toBe(ok);
  });
});
