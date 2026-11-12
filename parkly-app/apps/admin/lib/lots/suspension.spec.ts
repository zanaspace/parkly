import { describe, expect, it } from 'vitest';
import { canCancelUpcoming, impactSummary } from './suspension';

const up = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    code: `PK-${i}`,
    startAt: '2026-10-19T09:00:00.000Z',
    endAt: '2026-10-19T11:00:00.000Z',
    totalKobo: 100_000,
    driverFirstName: null,
  }));

describe('suspension impact copy', () => {
  it('says who is affected and what is always honoured', () => {
    expect(
      impactSummary({ upcoming: up(2), activeCount: 1, holdCount: 3, totalRefundKobo: 200_000 }),
    ).toBe(
      '2 paid bookings waiting to start (₦2,000 if all are refunded); 1 car parked there now (always honoured); 3 unpaid holds (they lapse by themselves).',
    );
    expect(impactSummary({ upcoming: [], activeCount: 0, holdCount: 0, totalRefundKobo: 0 })).toBe(
      'No paid bookings are waiting to start.',
    );
    expect(
      impactSummary({ upcoming: up(1), activeCount: 0, holdCount: 1, totalRefundKobo: 50_000 }),
    ).toContain('1 paid booking waiting');
  });

  it('shows the cancel button to ops, finance and super admin only', () => {
    for (const role of ['ADMIN_OPS', 'ADMIN_FINANCE', 'SUPER_ADMIN'])
      expect(canCancelUpcoming([{ role }])).toBe(true);
    for (const role of ['ADMIN_SUPPORT', 'ADMIN_COMPLIANCE'])
      expect(canCancelUpcoming([{ role }])).toBe(false);
  });
});
