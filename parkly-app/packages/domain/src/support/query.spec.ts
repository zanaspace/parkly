import { describe, expect, it } from 'vitest';
import { classifySupportQuery, maskedPhoneFromLast4 } from './query.js';

describe('support search: what was typed (FR-ADM-002)', () => {
  it('reads a booking code in any case, with or without the dash', () => {
    expect(classifySupportQuery('PK-AB23CD')).toEqual({ kind: 'CODE', code: 'PK-AB23CD' });
    expect(classifySupportQuery('pk ab23cd')).toEqual({ kind: 'CODE', code: 'PK-AB23CD' });
    expect(classifySupportQuery('pkab23cd')).toEqual({ kind: 'CODE', code: 'PK-AB23CD' });
  });

  it('reads a payment reference', () => {
    expect(classifySupportQuery('0192E220-0000-7000-8000-000000000001')).toEqual({
      kind: 'REFERENCE',
      reference: '0192e220-0000-7000-8000-000000000001',
    });
  });

  it('reads Nigerian mobiles however they are written, before plates', () => {
    for (const raw of ['0803 123 4567', '+234 803 123 4567', '2348031234567', '08031234567'])
      expect(classifySupportQuery(raw)).toEqual({ kind: 'PHONE', phone: '+2348031234567' });
  });

  it('reads a plate, and flags a six-character one that could be a code without "PK-"', () => {
    expect(classifySupportQuery('lnd-123-ab')).toEqual({ kind: 'PLATE', plateNorm: 'LND123AB' });
    expect(classifySupportQuery('AB23CD')).toEqual({
      kind: 'PLATE',
      plateNorm: 'AB23CD',
      alsoCode: 'PK-AB23CD',
    });
  });

  it('refuses what it cannot use', () => {
    for (const raw of ['', 'abc', 'hello world', '12345', 'x'.repeat(101)])
      expect(classifySupportQuery(raw)).toEqual({ kind: 'INVALID' });
  });

  it('masks a phone from its last four digits only', () => {
    expect(maskedPhoneFromLast4('4567')).toBe('+234 *** *** 4567');
    expect(maskedPhoneFromLast4(null)).toBeNull();
    expect(maskedPhoneFromLast4('45a7')).toBeNull();
  });
});
