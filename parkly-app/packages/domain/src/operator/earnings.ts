import { toCsv } from './csv.js';

export type DailyEarningsItem = {
  date: string;
  bookingsCount: number;
  grossBookingKobo: number;
  commissionKobo: number;
  serviceFeeKobo: number;
  netOperatorKobo: number;
  settlementKobo: number;
  settlementStatus: 'NONE' | 'PENDING' | 'PROCESSING' | 'SETTLED' | 'PARTIAL' | 'FAILED';
  settlementReferences: string[];
};

export type SettlementSummary = {
  id: string;
  providerSettlementId: string;
  amountKobo: number;
  status: 'PENDING' | 'PROCESSING' | 'SETTLED' | 'FAILED' | 'NEEDS_REVIEW';
  settledAt: string | null;
};

export type OperatorEarningsTotals = {
  bookingsCount: number;
  grossBookingKobo: number;
  commissionKobo: number;
  serviceFeeKobo: number;
  netOperatorKobo: number;
  settlementKobo: number;
};

export type OperatorEarningsReport = {
  operatorId: string;
  from: string;
  to: string;
  lotId: string | null;
  totals: OperatorEarningsTotals;
  daily: DailyEarningsItem[];
  settlements: SettlementSummary[];
};

export type MonthlyStatementLotSummary = {
  lotId: string;
  lotName: string;
  bookingsCount: number;
  grossBookingKobo: number;
  commissionKobo: number;
  netOperatorKobo: number;
};

export type MonthlyStatementTotals = {
  bookingsCount: number;
  grossBookingKobo: number;
  commissionKobo: number;
  serviceFeeKobo: number;
  netOperatorKobo: number;
  settlementKobo: number;
  closingBalanceKobo: number;
};

/** Kobo as naira with two decimals, without floating point (Never-do #10). */
export function naira(kobo: number): string {
  const isNegative = kobo < 0;
  const abs = Math.abs(kobo);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${frac}`;
}

/** Formats a date as "YYYY-MM-DD HH:mm" in Lagos time (UTC+1). */
export function lagosTime(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d.getTime() + 60 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

/** Sums up daily earnings items into report totals. */
export function calculateEarningsTotals(
  items: readonly DailyEarningsItem[],
): OperatorEarningsTotals {
  let bookingsCount = 0;
  let grossBookingKobo = 0;
  let commissionKobo = 0;
  let serviceFeeKobo = 0;
  let netOperatorKobo = 0;
  let settlementKobo = 0;

  for (const item of items) {
    bookingsCount += item.bookingsCount;
    grossBookingKobo += item.grossBookingKobo;
    commissionKobo += item.commissionKobo;
    serviceFeeKobo += item.serviceFeeKobo;
    netOperatorKobo += item.netOperatorKobo;
    settlementKobo += item.settlementKobo;
  }

  return {
    bookingsCount,
    grossBookingKobo,
    commissionKobo,
    serviceFeeKobo,
    netOperatorKobo,
    settlementKobo,
  };
}

/** Computes statement totals across lots and settlements for a monthly period. */
export function calculateStatementTotals(
  lots: readonly MonthlyStatementLotSummary[],
  settlements: readonly SettlementSummary[],
  serviceFeeKobo = 0,
): MonthlyStatementTotals {
  let bookingsCount = 0;
  let grossBookingKobo = 0;
  let commissionKobo = 0;
  let netOperatorKobo = 0;

  for (const lot of lots) {
    bookingsCount += lot.bookingsCount;
    grossBookingKobo += lot.grossBookingKobo;
    commissionKobo += lot.commissionKobo;
    netOperatorKobo += lot.netOperatorKobo;
  }

  let settlementKobo = 0;
  for (const s of settlements) {
    if (s.status === 'SETTLED') {
      settlementKobo += s.amountKobo;
    }
  }

  return {
    bookingsCount,
    grossBookingKobo,
    commissionKobo,
    serviceFeeKobo,
    netOperatorKobo,
    settlementKobo,
    closingBalanceKobo: netOperatorKobo - settlementKobo,
  };
}

const CSV_HEADER = [
  'date',
  'bookings_count',
  'gross_booking_ngn',
  'commission_ngn',
  'service_fee_ngn',
  'net_operator_ngn',
  'settlement_ngn',
  'settlement_status',
  'settlement_references',
];

/**
 * Builds watermarked CSV for operator earnings export (FR-OPS-003, S7 task 5).
 * Formula cells are defused via toCsv.
 */
export function earningsToCsv(
  report: OperatorEarningsReport,
  meta: { userId: string; exportedAt: Date; lotName?: string | null },
): string {
  const watermark = [
    [
      'Parkly revenue report',
      `Exported by user ${meta.userId}`,
      `At ${lagosTime(meta.exportedAt)} Lagos`,
      `Dates ${report.from} to ${report.to}`,
      `Car park ${meta.lotName ?? 'all'}`,
    ],
    [],
    CSV_HEADER,
  ];

  const rows = report.daily.map((r) => [
    r.date,
    r.bookingsCount,
    naira(r.grossBookingKobo),
    naira(r.commissionKobo),
    naira(r.serviceFeeKobo),
    naira(r.netOperatorKobo),
    naira(r.settlementKobo),
    r.settlementStatus,
    r.settlementReferences.join('; '),
  ]);

  const totals = [
    'Total',
    report.totals.bookingsCount,
    naira(report.totals.grossBookingKobo),
    naira(report.totals.commissionKobo),
    naira(report.totals.serviceFeeKobo),
    naira(report.totals.netOperatorKobo),
    naira(report.totals.settlementKobo),
    '',
    '',
  ];

  return toCsv([...watermark, ...rows, totals]);
}
