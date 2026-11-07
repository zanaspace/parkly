import { LEDGER_ACCOUNTS, operatorPayable } from '../booking/ledger.js';
import { lagosDateKey } from '../time/slots.js';
import { toCsv } from './csv.js';

/** What drivers paid, split by who keeps it, net of refunds. Shared by days, lots and totals. */
export type EarningsAmounts = {
  /** Bookings first paid for in the period (extensions and overstay don't add one). */
  bookingsCount: number;
  /** Everything drivers paid (bookings, extensions, overstay, service fee) less refunds. */
  grossBookingKobo: number;
  commissionKobo: number;
  serviceFeeKobo: number;
  netOperatorKobo: number;
  /**
   * Paid for extensions, before refunds. Refunds aren't split by kind: a
   * cancellation's journal is linked to the booking's latest payment, which may
   * be an extension, so they're only in `refundKobo`.
   */
  extensionKobo: number;
  /** Paid for overstay, before refunds (including any Park-now holding fee charged with it). */
  overstayKobo: number;
  /** Money handed back to drivers in the period (already taken off gross). */
  refundKobo: number;
};

export type DailyEarningsItem = EarningsAmounts & {
  date: string;
  /** Payouts that reached the operator's bank this day (SETTLED only). */
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

export type OperatorEarningsTotals = EarningsAmounts & {
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

export type MonthlyStatementTotals = EarningsAmounts & {
  settlementKobo: number;
  closingBalanceKobo: number;
};

/**
 * One ledger line of an operator's payment, with what the report groups by.
 * The store passes only lines on the commission, service fee and this
 * operator's payable accounts, for payments to this operator.
 */
export type EarningsLedgerLine = {
  account: string;
  direction: 'DEBIT' | 'CREDIT';
  amountKobo: number;
  postedAt: Date;
  paymentKind: 'BOOKING' | 'EXTENSION' | 'OVERSTAY' | 'PASS';
  bookingId: string | null;
  lotId: string | null;
};

const ZERO: EarningsAmounts = {
  bookingsCount: 0,
  grossBookingKobo: 0,
  commissionKobo: 0,
  serviceFeeKobo: 0,
  netOperatorKobo: 0,
  extensionKobo: 0,
  overstayKobo: 0,
  refundKobo: 0,
};

/**
 * Earnings from the ledger (doc 20 S7: report totals equal ledger sums).
 * A payment's journal credits commission, service fee and the operator's
 * payable; a refund's journal debits them back in the same proportions
 * (`cancellationRefundJournal`, `refundJournal`). So the split of a partial
 * refund, an extension or an overstay is exactly what was posted, and a
 * refund lands on the day it was posted, whenever the payment was.
 */
export function ledgerEarnings(
  lines: readonly EarningsLedgerLine[],
  operatorId: string,
): EarningsAmounts {
  const payable = operatorPayable(operatorId);
  const out = { ...ZERO };
  const paidBookings = new Set<string>();
  for (const l of lines) {
    const signed = l.direction === 'CREDIT' ? l.amountKobo : -l.amountKobo;
    if (l.account === LEDGER_ACCOUNTS.COMMISSION) out.commissionKobo += signed;
    else if (l.account === LEDGER_ACCOUNTS.SERVICE_FEE) out.serviceFeeKobo += signed;
    else if (l.account === payable) out.netOperatorKobo += signed;
    else continue;
    out.grossBookingKobo += signed;
    if (l.direction === 'DEBIT') {
      out.refundKobo += l.amountKobo;
      continue;
    }
    if (l.paymentKind === 'EXTENSION') out.extensionKobo += l.amountKobo;
    if (l.paymentKind === 'OVERSTAY') out.overstayKobo += l.amountKobo;
    if (l.paymentKind === 'BOOKING' && l.bookingId) paidBookings.add(l.bookingId);
  }
  out.bookingsCount = paidBookings.size;
  return out;
}

/** Ledger lines grouped by the Lagos day they were posted. */
export function dailyLedgerEarnings(
  lines: readonly EarningsLedgerLine[],
  operatorId: string,
  days: readonly string[],
): Map<string, EarningsAmounts> {
  const byDay = new Map<string, EarningsLedgerLine[]>();
  for (const l of lines) {
    const key = lagosDateKey(l.postedAt);
    const list = byDay.get(key);
    if (list) list.push(l);
    else byDay.set(key, [l]);
  }
  return new Map(days.map((d) => [d, ledgerEarnings(byDay.get(d) ?? [], operatorId)]));
}

/** Ledger lines grouped by car park, for the monthly statement. */
export function lotLedgerEarnings(
  lines: readonly EarningsLedgerLine[],
  operatorId: string,
  lotNames: ReadonlyMap<string, string>,
): MonthlyStatementLotSummary[] {
  const byLot = new Map<string, EarningsLedgerLine[]>();
  for (const l of lines) {
    if (!l.lotId) continue;
    const list = byLot.get(l.lotId);
    if (list) list.push(l);
    else byLot.set(l.lotId, [l]);
  }
  return [...byLot.entries()].map(([lotId, ls]) => {
    const a = ledgerEarnings(ls, operatorId);
    return {
      lotId,
      lotName: lotNames.get(lotId) ?? 'Car park',
      bookingsCount: a.bookingsCount,
      grossBookingKobo: a.grossBookingKobo,
      commissionKobo: a.commissionKobo,
      netOperatorKobo: a.netOperatorKobo,
    };
  });
}

/** How a day's payouts read: settled wins, then in flight, then failed. */
export function daySettlementStatus(
  statuses: readonly SettlementSummary['status'][],
): DailyEarningsItem['settlementStatus'] {
  if (statuses.includes('SETTLED')) return 'SETTLED';
  if (statuses.includes('PROCESSING')) return 'PROCESSING';
  if (statuses.includes('PENDING')) return 'PENDING';
  if (statuses.includes('FAILED')) return 'FAILED';
  return 'NONE';
}

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
  const totals: OperatorEarningsTotals = { ...ZERO, settlementKobo: 0 };
  for (const item of items) {
    totals.bookingsCount += item.bookingsCount;
    totals.grossBookingKobo += item.grossBookingKobo;
    totals.commissionKobo += item.commissionKobo;
    totals.serviceFeeKobo += item.serviceFeeKobo;
    totals.netOperatorKobo += item.netOperatorKobo;
    totals.extensionKobo += item.extensionKobo;
    totals.overstayKobo += item.overstayKobo;
    totals.refundKobo += item.refundKobo;
    totals.settlementKobo += item.settlementKobo;
  }
  return totals;
}

/**
 * Statement totals: the month's earnings (from `ledgerEarnings` over every
 * line, so lines without a car park still count) and what was settled.
 */
export function calculateStatementTotals(
  earnings: EarningsAmounts,
  settlements: readonly SettlementSummary[],
): MonthlyStatementTotals {
  let settlementKobo = 0;
  for (const s of settlements) {
    if (s.status === 'SETTLED') {
      settlementKobo += s.amountKobo;
    }
  }

  return {
    ...earnings,
    settlementKobo,
    closingBalanceKobo: earnings.netOperatorKobo - settlementKobo,
  };
}

const CSV_HEADER = [
  'date',
  'bookings_count',
  'gross_booking_ngn',
  'commission_ngn',
  'service_fee_ngn',
  'net_operator_ngn',
  'extension_ngn',
  'overstay_ngn',
  'refunds_ngn',
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
    naira(r.extensionKobo),
    naira(r.overstayKobo),
    naira(r.refundKobo),
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
    naira(report.totals.extensionKobo),
    naira(report.totals.overstayKobo),
    naira(report.totals.refundKobo),
    naira(report.totals.settlementKobo),
    '',
    '',
  ];

  return toCsv([...watermark, ...rows, totals]);
}

/** Parkly's side of the same money: what it kept, less what Paystack charged. */
export type PlatformAmounts = EarningsAmounts & {
  /** Paystack's fees on these payments, borne by Parkly (`fees.fee_bearer = PLATFORM`). */
  paymentFeesKobo: number;
  /** Commission plus service fees, less Paystack's fees. */
  netRevenueKobo: number;
};

/** A ledger line of any operator's payment, with that operator. */
export type PlatformLedgerLine = EarningsLedgerLine & { operatorId: string };

const PLATFORM_ZERO: PlatformAmounts = { ...ZERO, paymentFeesKobo: 0, netRevenueKobo: 0 };

function addAmounts(into: PlatformAmounts, a: EarningsAmounts): void {
  into.bookingsCount += a.bookingsCount;
  into.grossBookingKobo += a.grossBookingKobo;
  into.commissionKobo += a.commissionKobo;
  into.serviceFeeKobo += a.serviceFeeKobo;
  into.netOperatorKobo += a.netOperatorKobo;
  into.extensionKobo += a.extensionKobo;
  into.overstayKobo += a.overstayKobo;
  into.refundKobo += a.refundKobo;
}

/**
 * Platform revenue from the ledger, for the admin console. Each operator's
 * lines go through `ledgerEarnings` (so the split is exactly what was posted);
 * Paystack's fee lines on `PAYMENT_FEES_EXPENSE` are added on Parkly's side.
 */
export function platformLedgerEarnings(lines: readonly PlatformLedgerLine[]): {
  totals: PlatformAmounts;
  byOperator: Map<string, PlatformAmounts>;
} {
  const grouped = new Map<string, PlatformLedgerLine[]>();
  for (const l of lines) {
    const list = grouped.get(l.operatorId);
    if (list) list.push(l);
    else grouped.set(l.operatorId, [l]);
  }
  const totals = { ...PLATFORM_ZERO };
  const byOperator = new Map<string, PlatformAmounts>();
  for (const [operatorId, ls] of grouped) {
    const one = { ...PLATFORM_ZERO };
    addAmounts(one, ledgerEarnings(ls, operatorId));
    for (const l of ls) {
      if (l.account !== LEDGER_ACCOUNTS.PAYMENT_FEES) continue;
      one.paymentFeesKobo += l.direction === 'DEBIT' ? l.amountKobo : -l.amountKobo;
    }
    one.netRevenueKobo = one.commissionKobo + one.serviceFeeKobo - one.paymentFeesKobo;
    byOperator.set(operatorId, one);
    addAmounts(totals, one);
    totals.paymentFeesKobo += one.paymentFeesKobo;
  }
  totals.netRevenueKobo = totals.commissionKobo + totals.serviceFeeKobo - totals.paymentFeesKobo;
  return { totals, byOperator };
}
