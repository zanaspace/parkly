import { describe, expect, it } from 'vitest';
import { bookingCode, canWaive, overstayOwed } from './code';

describe('admin booking lookup', () => {
  it('reads a booking code however support types it', () => {
    expect(bookingCode('PK-3MV7BU')).toBe('PK-3MV7BU');
    expect(bookingCode(' pk-3mv7bu ')).toBe('PK-3MV7BU');
    expect(bookingCode('pk3mv7bu')).toBe('PK-3MV7BU');
    expect(bookingCode('3MV7BU')).toBe('PK-3MV7BU');
    expect(bookingCode('PK-3MV7B')).toBeNull();
    expect(bookingCode('')).toBeNull();
  });

  it('offers a waiver only to ops, finance and super admins, only while owed', () => {
    expect(canWaive([{ role: 'ADMIN_OPS' }])).toBe(true);
    expect(canWaive([{ role: 'ADMIN_SUPPORT' }])).toBe(false);
    expect(overstayOwed({ status: 'UNPAID', minutes: 30, amountKobo: 25_000 })).toBe(true);
    expect(overstayOwed({ status: 'PAID', minutes: 30, amountKobo: 25_000 })).toBe(false);
    expect(overstayOwed(null)).toBe(false);
  });
});
