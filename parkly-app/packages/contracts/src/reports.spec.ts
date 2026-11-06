import { describe, expect, it } from 'vitest';
import {
  DailyEarningsItemSchema,
  MonthlyStatementSchema,
  OperatorEarningsQuerySchema,
  OperatorEarningsReportSchema,
} from './reports.js';

describe('reports contracts (FR-OPS-003, FR-OPS-006)', () => {
  it('validates a valid earnings query', () => {
    const valid = OperatorEarningsQuerySchema.safeParse({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(valid.success).toBe(true);

    const invalidDate = OperatorEarningsQuerySchema.safeParse({
      from: 'invalid',
      to: '2026-10-31',
    });
    expect(invalidDate.success).toBe(false);
  });

  it('validates an earnings report object', () => {
    const report = {
      operatorId: '0192e220-0000-7000-8000-000000000001',
      from: '2026-10-01',
      to: '2026-10-02',
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
          date: '2026-10-01',
          bookingsCount: 5,
          grossBookingKobo: 500_000,
          commissionKobo: 50_000,
          serviceFeeKobo: 10_000,
          netOperatorKobo: 450_000,
          settlementKobo: 450_000,
          settlementStatus: 'SETTLED',
          settlementReferences: ['SETTLE_123'],
        },
      ],
      settlements: [
        {
          id: '0192e220-0000-7000-8000-000000000002',
          providerSettlementId: 'SETTLE_123',
          amountKobo: 450_000,
          status: 'SETTLED',
          settledAt: new Date().toISOString(),
        },
      ],
    };

    const parsed = OperatorEarningsReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it('validates a monthly statement object', () => {
    const statement = {
      statementNumber: 'STM-202610-0001',
      month: '2026-10',
      operatorId: '0192e220-0000-7000-8000-000000000001',
      operatorName: 'Lekki Prime Parking Ltd',
      payoutAccount: {
        bankName: 'Access Bank',
        accountNumberLast4: '1234',
        accountName: 'Lekki Prime Parking Ltd',
      },
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      totals: {
        bookingsCount: 10,
        grossBookingKobo: 1_000_000,
        commissionKobo: 100_000,
        serviceFeeKobo: 20_000,
        netOperatorKobo: 900_000,
        settlementKobo: 900_000,
        closingBalanceKobo: 0,
      },
      lots: [
        {
          lotId: '0192e220-0000-7000-8000-000000000003',
          lotName: 'Admiralty Way Lot A',
          bookingsCount: 10,
          grossBookingKobo: 1_000_000,
          commissionKobo: 100_000,
          netOperatorKobo: 900_000,
        },
      ],
      settlements: [],
      generatedAt: new Date().toISOString(),
    };

    const parsed = MonthlyStatementSchema.safeParse(statement);
    expect(parsed.success).toBe(true);
  });
});
