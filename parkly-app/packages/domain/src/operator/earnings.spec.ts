import { describe, expect, it } from 'vitest';
import { cancellationRefundJournal } from '../booking/cancellation.js';
import {
  bookingPaymentJournal,
  type JournalLine,
  LEDGER_ACCOUNTS,
  operatorPayable,
  providerFeeJournal,
} from '../booking/ledger.js';
import type { Kobo } from '../money/money.js';
import {
  calculateEarningsTotals,
  calculateStatementTotals,
  dailyLedgerEarnings,
  daySettlementStatus,
  type EarningsLedgerLine,
  earningsToCsv,
  lagosTime,
  ledgerEarnings,
  lotLedgerEarnings,
  naira,
  platformLedgerEarnings,
} from './earnings.js';

const OP = '0192e220-0000-7000-8000-0000000000aa';
const LOT_A = '0192e220-0000-7000-8000-0000000000a1';
const LOT_B = '0192e220-0000-7000-8000-0000000000b1';

const k = (n: number) => n as Kobo;

/** The lines a journal posts, as the store hands them to the report. */
function posted(
  journal: JournalLine[],
  at: string,
  over: Partial<EarningsLedgerLine> = {},
): EarningsLedgerLine[] {
  return journal.map((l) => ({
    ...l,
    postedAt: new Date(at),
    paymentKind: 'BOOKING',
    bookingId: 'b-1',
    lotId: LOT_A,
    ...over,
  }));
}

/** ₦1,000 booking, ₦100 service fee, 12% commission: what settle posts. */
const booking = (id: string, at: string, over: Partial<EarningsLedgerLine> = {}) =>
  posted(
    bookingPaymentJournal({
      provider: 'FAKE',
      operatorId: OP,
      priceKobo: k(100_000),
      serviceFeeKobo: k(10_000),
      commissionBps: 1200,
    }),
    at,
    { bookingId: id, ...over },
  );

/** An extension or overstay payment: its own amount, no service fee (settle-plan `grossOf`). */
const addOn = (
  kind: 'EXTENSION' | 'OVERSTAY',
  amount: number,
  at: string,
  over: Partial<EarningsLedgerLine> = {},
) =>
  posted(
    bookingPaymentJournal({
      provider: 'FAKE',
      operatorId: OP,
      priceKobo: k(amount),
      serviceFeeKobo: k(0),
      commissionBps: 1200,
    }),
    at,
    { paymentKind: kind, ...over },
  );

const fullPayment = {
  provider: 'FAKE' as const,
  operatorId: OP,
  priceKobo: k(100_000),
  serviceFeeKobo: k(10_000),
  commissionBps: 1200,
};

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

  describe('ledgerEarnings', () => {
    it('splits a booking payment as the journal posted it', () => {
      expect(ledgerEarnings(booking('b-1', '2026-11-03T10:00:00Z'), OP)).toEqual({
        bookingsCount: 1,
        grossBookingKobo: 110_000,
        commissionKobo: 12_000,
        serviceFeeKobo: 10_000,
        netOperatorKobo: 88_000,
        extensionKobo: 0,
        overstayKobo: 0,
        refundKobo: 0,
      });
    });

    it('takes the service fee once per booking, however many payments the booking has', () => {
      // Review bug 1: the old report subtracted the booking's fee from every payment.
      const lines = [
        ...booking('b-1', '2026-11-03T10:00:00Z'),
        ...addOn('EXTENSION', 50_000, '2026-11-03T11:00:00Z'),
        ...addOn('OVERSTAY', 25_000, '2026-11-03T13:00:00Z'),
      ];
      expect(ledgerEarnings(lines, OP)).toEqual({
        bookingsCount: 1,
        grossBookingKobo: 185_000,
        commissionKobo: 12_000 + 6_000 + 3_000,
        serviceFeeKobo: 10_000,
        netOperatorKobo: 88_000 + 44_000 + 22_000,
        extensionKobo: 50_000,
        overstayKobo: 25_000,
        refundKobo: 0,
      });
    });

    it('takes a partial refund off both shares, as the refund journal posted it', () => {
      // Review bug 3: the old report charged the whole refund to the operator.
      const refund = cancellationRefundJournal({
        payment: fullPayment,
        refundPriceKobo: k(50_000),
        refundServiceFeeKobo: k(10_000),
      });
      const lines = [
        ...booking('b-1', '2026-11-03T10:00:00Z'),
        ...posted(refund, '2026-11-03T12:00:00Z'),
      ];
      expect(ledgerEarnings(lines, OP)).toEqual({
        bookingsCount: 1,
        grossBookingKobo: 50_000,
        commissionKobo: 6_000,
        serviceFeeKobo: 0,
        netOperatorKobo: 44_000,
        extensionKobo: 0,
        overstayKobo: 0,
        refundKobo: 60_000,
      });
    });

    it('keeps extension and overstay as paid: a refund posted against an extension stays in refunds', () => {
      // A cancellation's journal is linked to the booking's latest payment.
      const refund = cancellationRefundJournal({
        payment: fullPayment,
        refundPriceKobo: k(50_000),
        refundServiceFeeKobo: k(0),
      });
      const lines = [
        ...booking('b-1', '2026-11-03T10:00:00Z'),
        ...addOn('EXTENSION', 50_000, '2026-11-03T11:00:00Z'),
        ...posted(refund, '2026-11-03T12:00:00Z', { paymentKind: 'EXTENSION' }),
      ];
      expect(ledgerEarnings(lines, OP)).toMatchObject({
        grossBookingKobo: 110_000,
        extensionKobo: 50_000,
        refundKobo: 50_000,
        bookingsCount: 1,
      });
    });

    it("ignores the provider's fee and other operators' payable", () => {
      const lines = [
        ...booking('b-1', '2026-11-03T10:00:00Z'),
        ...posted(
          providerFeeJournal({ provider: 'FAKE', feesKobo: k(1_500) }),
          '2026-11-03T10:00:00Z',
        ),
        {
          account: operatorPayable('someone-else'),
          direction: 'CREDIT' as const,
          amountKobo: 99_999,
          postedAt: new Date('2026-11-03T10:00:00Z'),
          paymentKind: 'BOOKING' as const,
          bookingId: 'b-x',
          lotId: LOT_A,
        },
      ];
      const out = ledgerEarnings(lines, OP);
      expect(out.grossBookingKobo).toBe(110_000);
      expect(out.bookingsCount).toBe(1);
    });

    it('agrees with the ledger: gross is the sum of the three revenue accounts', () => {
      const lines = [
        ...booking('b-1', '2026-11-03T10:00:00Z'),
        ...addOn('OVERSTAY', 37_500, '2026-11-03T13:00:00Z'),
      ];
      const accounts: string[] = [
        LEDGER_ACCOUNTS.COMMISSION,
        LEDGER_ACCOUNTS.SERVICE_FEE,
        operatorPayable(OP),
      ];
      const ledgerSum = lines
        .filter((l) => accounts.includes(l.account))
        .reduce((n, l) => n + (l.direction === 'CREDIT' ? l.amountKobo : -l.amountKobo), 0);
      const out = ledgerEarnings(lines, OP);
      expect(out.grossBookingKobo).toBe(ledgerSum);
      expect(out.commissionKobo + out.serviceFeeKobo + out.netOperatorKobo).toBe(ledgerSum);
    });
  });

  it('puts a refund on the Lagos day it was posted, not the day of the payment', () => {
    // Review bug 2: a refund for yesterday's booking vanished from the old report.
    const refund = cancellationRefundJournal({
      payment: fullPayment,
      refundPriceKobo: k(100_000),
      refundServiceFeeKobo: k(10_000),
    });
    const lines = [
      // 23:30 Lagos on the 3rd
      ...booking('b-1', '2026-11-03T22:30:00Z'),
      // 00:30 Lagos on the 4th
      ...posted(refund, '2026-11-03T23:30:00Z'),
    ];
    const days = dailyLedgerEarnings(lines, OP, ['2026-11-03', '2026-11-04', '2026-11-05']);
    expect(days.get('2026-11-03')).toMatchObject({ grossBookingKobo: 110_000, bookingsCount: 1 });
    expect(days.get('2026-11-04')).toMatchObject({
      grossBookingKobo: -110_000,
      refundKobo: 110_000,
      netOperatorKobo: -88_000,
      bookingsCount: 0,
    });
    expect(days.get('2026-11-05')?.grossBookingKobo).toBe(0);
  });

  it('groups by car park for the statement', () => {
    const lines = [
      ...booking('b-1', '2026-11-03T10:00:00Z', { lotId: LOT_A }),
      ...booking('b-2', '2026-11-03T10:00:00Z', { lotId: LOT_B }),
      ...addOn('EXTENSION', 50_000, '2026-11-03T11:00:00Z', { bookingId: 'b-2', lotId: LOT_B }),
      ...booking('pass', '2026-11-03T10:00:00Z', { lotId: null, paymentKind: 'PASS' }),
    ];
    const lots = lotLedgerEarnings(lines, OP, new Map([[LOT_A, 'Alpha']]));
    expect(lots).toEqual([
      {
        lotId: LOT_A,
        lotName: 'Alpha',
        bookingsCount: 1,
        grossBookingKobo: 110_000,
        commissionKobo: 12_000,
        netOperatorKobo: 88_000,
      },
      {
        lotId: LOT_B,
        lotName: 'Car park',
        bookingsCount: 1,
        grossBookingKobo: 160_000,
        commissionKobo: 18_000,
        netOperatorKobo: 132_000,
      },
    ]);
  });

  it('reads a day of payouts: settled, then in flight, then failed', () => {
    expect(daySettlementStatus([])).toBe('NONE');
    expect(daySettlementStatus(['NEEDS_REVIEW'])).toBe('NONE');
    expect(daySettlementStatus(['FAILED'])).toBe('FAILED');
    expect(daySettlementStatus(['FAILED', 'PENDING'])).toBe('PENDING');
    expect(daySettlementStatus(['PENDING', 'PROCESSING'])).toBe('PROCESSING');
    expect(daySettlementStatus(['PROCESSING', 'SETTLED'])).toBe('SETTLED');
  });

  const amounts = (over: Partial<ReturnType<typeof ledgerEarnings>> = {}) => ({
    bookingsCount: 0,
    grossBookingKobo: 0,
    commissionKobo: 0,
    serviceFeeKobo: 0,
    netOperatorKobo: 0,
    extensionKobo: 0,
    overstayKobo: 0,
    refundKobo: 0,
    ...over,
  });

  it('calculates earnings totals correctly', () => {
    const daily = [
      {
        date: '2026-11-01',
        ...amounts({
          bookingsCount: 2,
          grossBookingKobo: 200_000,
          commissionKobo: 20_000,
          serviceFeeKobo: 5_000,
          netOperatorKobo: 175_000,
          overstayKobo: 10_000,
        }),
        settlementKobo: 0,
        settlementStatus: 'NONE' as const,
        settlementReferences: [],
      },
      {
        date: '2026-11-02',
        ...amounts({
          bookingsCount: 3,
          grossBookingKobo: 300_000,
          commissionKobo: 30_000,
          serviceFeeKobo: 7_500,
          netOperatorKobo: 262_500,
          extensionKobo: 40_000,
          refundKobo: 5_000,
        }),
        settlementKobo: 450_000,
        settlementStatus: 'SETTLED' as const,
        settlementReferences: ['SETTLE_1'],
      },
    ];

    expect(calculateEarningsTotals(daily)).toEqual({
      bookingsCount: 5,
      grossBookingKobo: 500_000,
      commissionKobo: 50_000,
      serviceFeeKobo: 12_500,
      netOperatorKobo: 437_500,
      extensionKobo: 40_000,
      overstayKobo: 10_000,
      refundKobo: 5_000,
      settlementKobo: 450_000,
    });
  });

  it('calculates statement totals: settled payouts only, closing balance is what is still owed', () => {
    const earnings = amounts({
      bookingsCount: 15,
      grossBookingKobo: 1_525_000,
      commissionKobo: 150_000,
      serviceFeeKobo: 25_000,
      netOperatorKobo: 1_350_000,
    });
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

    expect(calculateStatementTotals(earnings, settlements)).toEqual({
      ...earnings,
      settlementKobo: 900_000,
      closingBalanceKobo: 450_000,
    });
  });

  it('generates watermarked CSV with headers, rows and totals', () => {
    const day = amounts({
      bookingsCount: 5,
      grossBookingKobo: 500_000,
      commissionKobo: 50_000,
      serviceFeeKobo: 10_000,
      netOperatorKobo: 440_000,
      extensionKobo: 20_000,
      overstayKobo: 15_000,
      refundKobo: 3_000,
    });
    const report = {
      operatorId: '0192e220-0000-7000-8000-000000000001',
      from: '2026-11-01',
      to: '2026-11-02',
      lotId: null,
      totals: { ...day, settlementKobo: 440_000 },
      daily: [
        {
          date: '2026-11-01',
          ...day,
          settlementKobo: 440_000,
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
    expect(csv).toContain(
      'date,bookings_count,gross_booking_ngn,commission_ngn,service_fee_ngn,net_operator_ngn,extension_ngn,overstay_ngn,refunds_ngn,settlement_ngn',
    );
    expect(csv).toContain(
      '2026-11-01,5,5000.00,500.00,100.00,4400.00,200.00,150.00,30.00,4400.00,SETTLED',
    );
    // Notice formula injection defusing with single quote
    expect(csv).toContain("'=SETTLE_MALICIOUS; SETTLE_OK");
    expect(csv).toContain('Total,5,5000.00,500.00,100.00,4400.00,200.00,150.00,30.00,4400.00');
  });
});

describe('platformLedgerEarnings', () => {
  const OTHER = '0192e220-0000-7000-8000-0000000000bb';
  const fee = (op: string, at: string) =>
    posted(providerFeeJournal({ provider: 'FAKE', feesKobo: k(1_500) }), at, {
      operatorId: op,
    } as Partial<EarningsLedgerLine>);
  const withOp = (lines: EarningsLedgerLine[], operatorId: string) =>
    lines.map((l) => ({ ...l, operatorId }));

  it("adds every operator's split and takes Paystack's fees off Parkly's side", () => {
    const otherBooking = posted(
      bookingPaymentJournal({
        provider: 'FAKE',
        operatorId: OTHER,
        priceKobo: k(200_000),
        serviceFeeKobo: k(10_000),
        commissionBps: 1000,
      }),
      '2026-11-03T10:00:00Z',
      { bookingId: 'b-2' },
    );
    const lines = [
      ...withOp(booking('b-1', '2026-11-03T10:00:00Z'), OP),
      ...withOp(fee(OP, '2026-11-03T10:00:00Z'), OP),
      ...withOp(otherBooking, OTHER),
      ...withOp(fee(OTHER, '2026-11-03T10:00:00Z'), OTHER),
    ];
    const { totals, byOperator } = platformLedgerEarnings(lines);
    expect(byOperator.get(OP)).toMatchObject({
      commissionKobo: 12_000,
      serviceFeeKobo: 10_000,
      paymentFeesKobo: 1_500,
      netRevenueKobo: 20_500,
      netOperatorKobo: 88_000,
    });
    expect(byOperator.get(OTHER)).toMatchObject({
      commissionKobo: 20_000,
      netOperatorKobo: 180_000,
      netRevenueKobo: 28_500,
    });
    expect(totals).toMatchObject({
      bookingsCount: 2,
      grossBookingKobo: 320_000,
      commissionKobo: 32_000,
      serviceFeeKobo: 20_000,
      netOperatorKobo: 268_000,
      paymentFeesKobo: 3_000,
      netRevenueKobo: 49_000,
    });
  });

  it('is zero with no lines', () => {
    const { totals, byOperator } = platformLedgerEarnings([]);
    expect(totals.netRevenueKobo).toBe(0);
    expect(byOperator.size).toBe(0);
  });
});
