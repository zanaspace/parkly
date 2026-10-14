import { describe, expect, it } from 'vitest';
import { isValidPlate, normalisePlate } from './plate.js';

describe('normalisePlate', () => {
  it.each([
    ['LND-123-AB', 'LND123AB'],
    ['lnd 123 ab', 'LND123AB'],
    ['  KJA.456.XY ', 'KJA456XY'],
    ['abc123de', 'ABC123DE'],
  ])('%j → %j', (raw, norm) => {
    expect(normalisePlate(raw)).toBe(norm);
  });
});

describe('isValidPlate', () => {
  it.each(['LND-123-AB', 'KJA 456 XY', 'FG 12 A01', 'AB123'])('accepts %j', (raw) => {
    expect(isValidPlate(raw)).toBe(true);
  });
  it.each(['', '   ', '12345', 'ABCDE', 'A1', 'ABCDEFGHIJ1', 'LND-123-AB!', 'ЛНД123'])(
    'rejects %j',
    (raw) => {
      expect(isValidPlate(raw)).toBe(false);
    },
  );
});
