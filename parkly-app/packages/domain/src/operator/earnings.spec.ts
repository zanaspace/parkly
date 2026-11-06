import { describe, expect, it } from 'vitest';
import {
  calculateEarningsTotals,
  calculateStatementTotals,
  earningsToCsv,
  lagosTime,
  naira,
} from './earnings.js';

describe('earnings domain logic (FR-OPS-003, FR-OPS-006)', () => {
  it('formats kobo to naira accurately without floating point issues', () => {
    expect(naira(0)).toBe('0.00');
    expect(naira(50)).toBe('0.50');
    expect(naira(100)).toBe('1.00');
    expect(naira(150_000)).toBe('1500.00');
    expect(naira(-250)).toBe('-2.50');
  });

  it('formats lagos time', () => {
    const d = new Date('2026-11-06T12:00:00Z');
    expect(lagosTime(d)).toBe('2026-11-06 13:00');
    expect(lagosTime(null)).toBeNull();
  });

  it('calculates earnings totals correctly', () => {
    const daily = [
      {
        date: '2026-11-01',
        bookingsCount: 2,
        grossBookingKobo: 200_000,
        commissionKobo: 20_000,
        serviceFeeKobo: 5_000,
        netOperatorKobo: 180_000,
        settlementKobo: 0,
        settlementStatus: 'NONE' as const,
        settlementReferences: [],
      },
      {
        date: '2026-11-02',
        bookingsCount: 3,
        grossBookingKobo: 300_000,
        commissionKobo: 30_000,
        serviceFeeKobo: 7_500,
        netOperatorKobo: 270_000,
        settlementKobo: 450_000,
        settlementStatus: 'SETTLED' as const,
        settlementReferences: ['SETTLE_1'],
      },
    ];

    const totals = calculateEarningsTotals(daily);
    expect(totals).toEqual({
      bookingsCount: 5,
      grossBookingKobo: 500_000,
      commissionKobo: 50_000,
      serviceFeeKobo: 12_500,
      netOperatorKobo: 450_000,
      settlementKobo: 450_000,
    });
  });

  it('calculates statement totals across lots and settlements', () => {
    const lots = [
      {
        lotId: '0192e220-0000-7000-8000-000000000001',
        lotName: 'Lot 1',
        bookingsCount: 10,
        grossBookingKobo: 1_000_000,
        commissionKobo: 100_000,
        netOperatorKobo: 900_000,
      },
      {
        lotId: '0192e220-0000-7000-8000-000000000002',
        lotName: 'Lot 2',
        bookingsCount: 5,
        grossBookingKobo: 500_000,
        commissionKobo: 50_000,
        netOperatorKobo: 450_000,
      },
    ];

    const settlements = [
      {
        id: '0192e220-0000-7000-8000-000000000003',
        providerSettlementId: 'SETTLE_A',
        amountKobo: 900_000,
        status: 'SETTLED' as const,
        settledAt: new Date().toISOString(),
      },
      {
        id: '0192e220-0000-7000-8000-000000000004',
        providerSettlementId: 'SETTLE_B',
        amountKobo: 450_000,
        status: 'PENDING' as const,
        settledAt: null,
      },
    ];

    const totals = calculateStatementTotals(lots, settlements, 25_000);
    expect(totals).toEqual({
      bookingsCount: 15,
      grossBookingKobo: 1_500_000,
      commissionKobo: 150_000,
      serviceFeeKobo: 25_000,
      netOperatorKobo: 1_350_000,
      settlementKobo: 900_000,
      closingBalanceKobo: 450_000,
    });
  });

  it('generates watermarked CSV with headers, rows and totals', () => {
    const report = {
      operatorId: '0192e220-0000-7000-8000-000000000001',
      from: '2026-11-01',
      to: '2026-11-02',
      lotId: null,
      totals: {
        bookingsCount: 5,
        grossBookingKobo: 500_000,
        commissionKobo: 50_000,
        serviceFeeKobo: 10_000,
        netOperatorKobo: 450_000,
        settlementKobo: 450_000,
      },
      daily: [
        {
          date: '2026-11-01',
          bookingsCount: 5,
          grossBookingKobo: 500_000,
          commissionKobo: 50_000,
          serviceFeeKobo: 10_000,
          netOperatorKobo: 450_000,
          settlementKobo: 450_000,
          settlementStatus: 'SETTLED' as const,
          settlementReferences: ['=SETTLE_MALICIOUS', 'SETTLE_OK'],
        },
      ],
      settlements: [],
    };

    const csv = earningsToCsv(report, {
      userId: 'user-123',
      exportedAt: new Date('2026-11-06T10:00:00Z'),
    });

    expect(csv).toContain('Parkly revenue report');
    expect(csv).toContain('Exported by user user-123');
    expect(csv).toContain('Dates 2026-11-01 to 2026-11-02');
    expect(csv).toContain('date,bookings_count,gross_booking_ngn');
    expect(csv).toContain('2026-11-01,5,5000.00,500.00,100.00,4500.00,4500.00,SETTLED');
    // Notice formula injection defusing with single quote
    expect(csv).toContain("'=SETTLE_MALICIOUS; SETTLE_OK");
    expect(csv).toContain('Total,5,5000.00,500.00,100.00,4500.00,4500.00');
  });
});
