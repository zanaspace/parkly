import type {
  DailyEarningsItem,
  MonthlyStatement,
  MonthlyStatementLotSummary,
  OperatorEarningsReport,
  SettlementSummary,
} from '@parkly/contracts';
import { calculateEarningsTotals, calculateStatementTotals } from '@parkly/domain/operator';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';
import type { MemoryBookings } from './memory-bookings.js';
import type { MemorySettlements } from './memory-settlements.js';
import type { LotRow, MemberRow, OperatorRow, PayoutAccountRow, Store, UserRow } from './types.js';

const DAY_MS = 24 * 60 * 60_000;

function enumerateDays(fromKey: string, toKey: string): string[] {
  const fromTime = lagosDayStart(fromKey).getTime();
  const toTime = lagosDayStart(toKey).getTime();
  const days: string[] = [];
  for (let t = fromTime; t <= toTime; t += DAY_MS) {
    days.push(lagosDateKey(new Date(t + 60 * 60_000))); // within Lagos day
  }
  return days;
}

function monthDateRange(month: string): { from: string; to: string; startUtc: Date; endUtc: Date } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  const startUtc = lagosDayStart(from);
  const endUtc = new Date(lagosDayStart(to).getTime() + DAY_MS);
  return { from, to, startUtc, endUtc };
}

export class MemoryReports {
  constructor(
    private readonly deps: {
      bookings: MemoryBookings;
      settlementStore: MemorySettlements;
      lotRows: Map<string, LotRow>;
      operatorRows: Map<string, OperatorRow>;
      userRows: Map<string, UserRow & { email?: string }>;
      memberRows: (MemberRow & { role: string })[];
      payoutRows: Map<string, PayoutAccountRow>;
    },
  ) {}

  readonly reports: Store['reports'] = {
    operatorEarnings: async ({ operatorId, from, to, lotId }) => {
      const startUtc = lagosDayStart(from);
      const endUtc = new Date(lagosDayStart(to).getTime() + DAY_MS);

      const days = enumerateDays(from, to);
      const bookingLots = new Map(this.deps.bookings.bookingRows.map((b) => [b.id, b.lotId]));
      const bookingFees = new Map(
        this.deps.bookings.bookingRows.map((b) => [b.id, b.serviceFeeKobo]),
      );

      // 1. Relevant successful payments
      const payments = this.deps.bookings.paymentRows.filter((p) => {
        if (p.operatorId !== operatorId || p.status !== 'SUCCEEDED' || !p.paidAt) return false;
        if (p.paidAt < startUtc || p.paidAt >= endUtc) return false;
        if (lotId && p.bookingId && bookingLots.get(p.bookingId) !== lotId) return false;
        return true;
      });

      // 2. Relevant refunds
      const paymentIds = new Set(payments.map((p) => p.id));
      const refunds = this.deps.bookings.refundRows.filter((r) => {
        if (!paymentIds.has(r.paymentId) || r.status !== 'SUCCEEDED') return false;
        const targetDate = r.createdAt ?? new Date(0);
        if (targetDate < startUtc || targetDate >= endUtc) return false;
        return true;
      });

      // 3. Relevant settlements
      const settlements = this.deps.settlementStore.rows.filter((s) => {
        if (s.operatorId !== operatorId) return false;
        const targetDate = s.settledAt ?? s.postedAt ?? new Date(0);
        return targetDate >= startUtc && targetDate < endUtc;
      });

      // 4. Daily breakdown
      const daily: DailyEarningsItem[] = days.map((dateKey) => {
        const dayPayments = payments.filter((p) => lagosDateKey(p.paidAt!) === dateKey);
        const dayPaymentIds = new Set(dayPayments.map((p) => p.id));
        const dayRefunds = refunds.filter(
          (r) =>
            dayPaymentIds.has(r.paymentId) && lagosDateKey(r.createdAt ?? new Date(0)) === dateKey,
        );

        let grossBookingKobo = dayPayments.reduce((sum, p) => sum + p.amountKobo, 0);
        let commissionKobo = dayPayments.reduce(
          (sum, p) =>
            sum + (p.platformAmountKobo - (p.bookingId ? (bookingFees.get(p.bookingId) ?? 0) : 0)),
          0,
        );
        let serviceFeeKobo = dayPayments.reduce(
          (sum, p) => sum + (p.bookingId ? (bookingFees.get(p.bookingId) ?? 0) : 0),
          0,
        );
        let netOperatorKobo = dayPayments.reduce((sum, p) => sum + p.operatorAmountKobo, 0);

        // Deduct refunds proportionally or directly
        for (const r of dayRefunds) {
          grossBookingKobo -= r.amountKobo;
          netOperatorKobo -= r.amountKobo;
        }

        const distinctBookings = new Set(
          dayPayments.map((p) => p.bookingId).filter((id): id is string => Boolean(id)),
        );

        const daySettlements = settlements.filter(
          (s) => lagosDateKey(s.settledAt ?? s.postedAt ?? new Date(0)) === dateKey,
        );
        const settlementKobo = daySettlements.reduce((sum, s) => sum + (s.amountKobo ?? 0), 0);
        const settlementReferences = daySettlements.map((s) => s.providerSettlementId);

        let settlementStatus: DailyEarningsItem['settlementStatus'] = 'NONE';
        if (daySettlements.some((s) => s.status === 'SETTLED')) settlementStatus = 'SETTLED';
        else if (daySettlements.some((s) => s.status === 'PENDING')) settlementStatus = 'PENDING';
        else if (daySettlements.some((s) => s.status === 'FAILED')) settlementStatus = 'FAILED';

        return {
          date: dateKey,
          bookingsCount: distinctBookings.size,
          grossBookingKobo,
          commissionKobo,
          serviceFeeKobo,
          netOperatorKobo,
          settlementKobo,
          settlementStatus,
          settlementReferences,
        };
      });

      const totals = calculateEarningsTotals(daily);

      const mappedSettlements: SettlementSummary[] = settlements.map((s) => ({
        id: s.id,
        providerSettlementId: s.providerSettlementId,
        amountKobo: s.amountKobo ?? 0,
        status: s.status,
        settledAt: s.settledAt?.toISOString() ?? null,
      }));

      return {
        operatorId,
        from,
        to,
        lotId: lotId ?? null,
        totals,
        daily,
        settlements: mappedSettlements,
      };
    },

    monthlyStatement: async ({ operatorId, month, lotId }) => {
      const op = this.deps.operatorRows.get(operatorId);
      if (!op) return null;

      const { from, to, startUtc, endUtc } = monthDateRange(month);
      const payout = this.deps.payoutRows.get(operatorId);

      const bookingMap = new Map(this.deps.bookings.bookingRows.map((b) => [b.id, b]));

      // Payments in month
      const payments = this.deps.bookings.paymentRows.filter((p) => {
        if (p.operatorId !== operatorId || p.status !== 'SUCCEEDED' || !p.paidAt) return false;
        if (p.paidAt < startUtc || p.paidAt >= endUtc) return false;
        if (lotId && p.bookingId && bookingMap.get(p.bookingId)?.lotId !== lotId) return false;
        return true;
      });

      // Refunds in month
      const paymentIds = new Set(payments.map((p) => p.id));
      const refunds = this.deps.bookings.refundRows.filter((r) => {
        if (!paymentIds.has(r.paymentId) || r.status !== 'SUCCEEDED') return false;
        const targetDate = r.createdAt ?? new Date(0);
        if (targetDate < startUtc || targetDate >= endUtc) return false;
        return true;
      });

      // Group by lot
      const lotsMap = new Map<
        string,
        {
          lotId: string;
          lotName: string;
          bookings: Set<string>;
          gross: number;
          commission: number;
          net: number;
        }
      >();

      for (const p of payments) {
        const b = p.bookingId ? bookingMap.get(p.bookingId) : undefined;
        const currentLotId = b?.lotId ?? 'unknown-lot';
        const lot = this.deps.lotRows.get(currentLotId);
        const lotName = lot?.name ?? 'General Parking';

        if (!lotsMap.has(currentLotId)) {
          lotsMap.set(currentLotId, {
            lotId: currentLotId,
            lotName,
            bookings: new Set(),
            gross: 0,
            commission: 0,
            net: 0,
          });
        }
        const item = lotsMap.get(currentLotId)!;
        if (p.bookingId) item.bookings.add(p.bookingId);
        const fee = p.bookingId ? (b?.serviceFeeKobo ?? 0) : 0;
        item.gross += p.amountKobo;
        item.commission += p.platformAmountKobo - fee;
        item.net += p.operatorAmountKobo;
      }

      // Deduct refunds from respective lots
      for (const r of refunds) {
        const p = payments.find((x) => x.id === r.paymentId);
        if (!p) continue;
        const b = p.bookingId ? bookingMap.get(p.bookingId) : undefined;
        const currentLotId = b?.lotId ?? 'unknown-lot';
        const item = lotsMap.get(currentLotId);
        if (item) {
          item.gross -= r.amountKobo;
          item.net -= r.amountKobo;
        }
      }

      const lots: MonthlyStatementLotSummary[] = [...lotsMap.values()].map((l) => ({
        lotId: l.lotId,
        lotName: l.lotName,
        bookingsCount: l.bookings.size,
        grossBookingKobo: l.gross,
        commissionKobo: l.commission,
        netOperatorKobo: l.net,
      }));

      // Settlements in month
      const settlements = this.deps.settlementStore.rows.filter((s) => {
        if (s.operatorId !== operatorId) return false;
        const targetDate = s.settledAt ?? s.postedAt ?? new Date(0);
        return targetDate >= startUtc && targetDate < endUtc;
      });

      const mappedSettlements: SettlementSummary[] = settlements.map((s) => ({
        id: s.id,
        providerSettlementId: s.providerSettlementId,
        amountKobo: s.amountKobo ?? 0,
        status: s.status,
        settledAt: s.settledAt?.toISOString() ?? null,
      }));

      const serviceFeeTotal = payments.reduce((sum, p) => {
        const b = p.bookingId ? bookingMap.get(p.bookingId) : undefined;
        return sum + (b?.serviceFeeKobo ?? 0);
      }, 0);
      const totals = calculateStatementTotals(lots, mappedSettlements, serviceFeeTotal);

      const statementNumber = `STM-${month.replace('-', '')}-${operatorId.slice(0, 8).toUpperCase()}`;

      return {
        statementNumber,
        month,
        operatorId,
        operatorName: op.legalName || op.tradingName,
        payoutAccount: payout
          ? {
              bankName: payout.bankName,
              accountNumberLast4: payout.accountNumberLast4,
              accountName: payout.accountName,
            }
          : null,
        periodStart: from,
        periodEnd: to,
        totals,
        lots,
        settlements: mappedSettlements,
        generatedAt: new Date().toISOString(),
      };
    },

    operatorsForMonthlyStatement: async (month) => {
      const { startUtc, endUtc } = monthDateRange(month);

      const activeOperators = [...this.deps.operatorRows.values()].filter(
        (op) => op.status === 'ACTIVE',
      );

      const results: { id: string; name: string; contactEmail: string }[] = [];

      for (const op of activeOperators) {
        // Check if operator had payments, settlements, or an active payout account
        const hasPayout = this.deps.payoutRows.get(op.id)?.status === 'ACTIVE';
        const hasPayment = this.deps.bookings.paymentRows.some(
          (p) =>
            p.operatorId === op.id &&
            p.status === 'SUCCEEDED' &&
            p.paidAt &&
            p.paidAt >= startUtc &&
            p.paidAt < endUtc,
        );
        const hasSettlement = this.deps.settlementStore.rows.some((s) => {
          if (s.operatorId !== op.id) return false;
          const targetDate = s.settledAt ?? s.postedAt ?? new Date(0);
          return targetDate >= startUtc && targetDate < endUtc;
        });

        if (hasPayout || hasPayment || hasSettlement) {
          results.push({
            id: op.id,
            name: op.legalName || op.tradingName,
            contactEmail: op.contactEmail ?? '',
          });
        }
      }

      return results;
    },
  };
}
