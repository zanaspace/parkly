import { describe, expect, it } from 'vitest';
import { canCancel, canRefund, nairaToKobo } from './money';

describe('refund amount input', () => {
  it('reads naira to kobo without floating point', () => {
    expect(nairaToKobo('1500')).toBe(150_000);
    expect(nairaToKobo('₦1,500.50')).toBe(150_050);
    expect(nairaToKobo('0.07')).toBe(7);
    expect(nairaToKobo(' 200.5 ')).toBe(20_050);
  });

  it('refuses zero, negatives, three decimals and words', () => {
    for (const bad of ['0', '-5', '1.234', 'abc', '', '1e5']) expect(nairaToKobo(bad)).toBeNull();
  });

  it('shows cancel to support and refund to finance only', () => {
    expect(canCancel([{ role: 'ADMIN_SUPPORT' }])).toBe(true);
    expect(canRefund([{ role: 'ADMIN_SUPPORT' }])).toBe(false);
    expect(canRefund([{ role: 'ADMIN_FINANCE' }])).toBe(true);
    expect(canCancel([{ role: 'ADMIN_COMPLIANCE' }])).toBe(false);
  });
});
