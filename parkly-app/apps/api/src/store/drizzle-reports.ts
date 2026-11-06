import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import type {
  DailyEarningsItem,
  MonthlyStatementLotSummary,
  SettlementSummary,
} from '@parkly/contracts';
import { calculateEarningsTotals, calculateStatementTotals } from '@parkly/domain/operator';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Store } from './types.js';

const { payments, refunds, bookings, settlements, lots, operators, payoutAccounts } = schema;

const DAY_MS = 24 * 60 * 60_000;

function enumerateDays(fromKey: string, toKey: string): string[] {
  const fromTime = lagosDayStart(fromKey).getTime();
  const toTime = lagosDayStart(toKey).getTime();
  const days: string[] = [];
  for (let t = fromTime; t <= toTime; t += DAY_MS) {
    days.push(lagosDateKey(new Date(t + 60 * 60_000)));
  }
  return days;
}

function monthDateRange(month: string): { from: string; to: string; startUtc: Date; endUtc: Date } {
  const parts = month.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  const startUtc = lagosDayStart(from);
  const endUtc = new Date(lagosDayStart(to).getTime() + DAY_MS);
  return { from, to, startUtc, endUtc };
}

export function drizzleReports(db: Db): Store['reports'] {
  return {
    async operatorEarnings({ operatorId, from, to, lotId }) {
      const startUtc = lagosDayStart(from);
      const endUtc = new Date(lagosDayStart(to).getTime() + DAY_MS);
      const days = enumerateDays(from, to);

      // 1. Fetch payments
      const paymentConditions = [
        eq(payments.operatorId, operatorId),
        eq(payments.status, 'SUCCEEDED'),
        gte(payments.paidAt, startUtc),
        lt(payments.paidAt, endUtc),
      ];
      if (lotId) {
        paymentConditions.push(eq(bookings.lotId, lotId));
      }

      const paymentRows = await db
        .select({
          id: payments.id,
          bookingId: payments.bookingId,
          amountKobo: payments.amountKobo,
          platformAmountKobo: payments.platformAmountKobo,
          operatorAmountKobo: payments.operatorAmountKobo,
          paidAt: payments.paidAt,
          serviceFeeKobo: bookings.serviceFeeKobo,
          lotId: bookings.lotId,
        })
        .from(payments)
        .innerJoin(bookings, eq(payments.bookingId, bookings.id))
        .where(and(...paymentConditions));

      // 2. Fetch refunds
      const paymentIds = paymentRows.map((p) => p.id);
      let refundRows: { id: string; paymentId: string; amountKobo: number; createdAt: Date }[] = [];
      if (paymentIds.length > 0) {
        refundRows = await db
          .select({
            id: refunds.id,
            paymentId: refunds.paymentId,
            amountKobo: refunds.amountKobo,
            createdAt: refunds.createdAt,
          })
          .from(refunds)
          .where(
            and(
              inArray(refunds.paymentId, paymentIds),
              eq(refunds.status, 'SUCCEEDED'),
              gte(refunds.createdAt, startUtc),
              lt(refunds.createdAt, endUtc),
            ),
          );
      }

      // 3. Fetch settlements
      const settlementRows = await db
        .select({
          id: settlements.id,
          providerSettlementId: settlements.providerSettlementId,
          amountKobo: settlements.amountKobo,
          status: settlements.status,
          settledAt: settlements.settledAt,
          createdAt: settlements.createdAt,
        })
        .from(settlements)
        .where(
          and(
            eq(settlements.operatorId, operatorId),
            gte(settlements.settledAt, startUtc),
            lt(settlements.settledAt, endUtc),
          ),
        );

      // 4. Group by day
      const daily: DailyEarningsItem[] = days.map((dateKey) => {
        const dayPayments = paymentRows.filter(
          (p) => p.paidAt && lagosDateKey(p.paidAt) === dateKey,
        );
        const dayPaymentIds = new Set(dayPayments.map((p) => p.id));
        const dayRefunds = refundRows.filter(
          (r) => dayPaymentIds.has(r.paymentId) && lagosDateKey(r.createdAt) === dateKey,
        );

        let grossBookingKobo = dayPayments.reduce((sum, p) => sum + p.amountKobo, 0);
        const commissionKobo = dayPayments.reduce(
          (sum, p) => sum + (p.platformAmountKobo - (p.serviceFeeKobo ?? 0)),
          0,
        );
        const serviceFeeKobo = dayPayments.reduce((sum, p) => sum + (p.serviceFeeKobo ?? 0), 0);
        let netOperatorKobo = dayPayments.reduce((sum, p) => sum + p.operatorAmountKobo, 0);

        for (const r of dayRefunds) {
          grossBookingKobo -= r.amountKobo;
          netOperatorKobo -= r.amountKobo;
        }

        const distinctBookings = new Set(
          dayPayments.map((p) => p.bookingId).filter((id): id is string => Boolean(id)),
        );

        const daySettlements = settlementRows.filter(
          (s) => s.settledAt && lagosDateKey(s.settledAt) === dateKey,
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

      const mappedSettlements: SettlementSummary[] = settlementRows.map((s) => ({
        id: s.id,
        providerSettlementId: s.providerSettlementId,
        amountKobo: s.amountKobo ?? 0,
        status: s.status,
        settledAt: s.settledAt ? s.settledAt.toISOString() : null,
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

    async monthlyStatement({ operatorId, month, lotId }) {
      const [op] = await db
        .select({
          id: operators.id,
          legalName: operators.legalName,
          tradingName: operators.tradingName,
        })
        .from(operators)
        .where(eq(operators.id, operatorId));

      if (!op) return null;

      const { from, to, startUtc, endUtc } = monthDateRange(month);

      const [payout] = await db
        .select({
          bankName: payoutAccounts.bankName,
          accountNumberLast4: payoutAccounts.accountNumberLast4,
          accountName: payoutAccounts.accountName,
        })
        .from(payoutAccounts)
        .where(eq(payoutAccounts.operatorId, operatorId));

      const paymentConditions = [
        eq(payments.operatorId, operatorId),
        eq(payments.status, 'SUCCEEDED'),
        gte(payments.paidAt, startUtc),
        lt(payments.paidAt, endUtc),
      ];
      if (lotId) {
        paymentConditions.push(eq(bookings.lotId, lotId));
      }

      const paymentRows = await db
        .select({
          id: payments.id,
          bookingId: payments.bookingId,
          amountKobo: payments.amountKobo,
          platformAmountKobo: payments.platformAmountKobo,
          operatorAmountKobo: payments.operatorAmountKobo,
          serviceFeeKobo: bookings.serviceFeeKobo,
          lotId: bookings.lotId,
          lotName: lots.name,
        })
        .from(payments)
        .innerJoin(bookings, eq(payments.bookingId, bookings.id))
        .innerJoin(lots, eq(bookings.lotId, lots.id))
        .where(and(...paymentConditions));

      const paymentIds = paymentRows.map((p) => p.id);
      let refundRows: { id: string; paymentId: string; amountKobo: number }[] = [];
      if (paymentIds.length > 0) {
        refundRows = await db
          .select({
            id: refunds.id,
            paymentId: refunds.paymentId,
            amountKobo: refunds.amountKobo,
          })
          .from(refunds)
          .where(
            and(
              inArray(refunds.paymentId, paymentIds),
              eq(refunds.status, 'SUCCEEDED'),
              gte(refunds.createdAt, startUtc),
              lt(refunds.createdAt, endUtc),
            ),
          );
      }

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

      for (const p of paymentRows) {
        if (!lotsMap.has(p.lotId)) {
          lotsMap.set(p.lotId, {
            lotId: p.lotId,
            lotName: p.lotName,
            bookings: new Set(),
            gross: 0,
            commission: 0,
            net: 0,
          });
        }
        const item = lotsMap.get(p.lotId);
        if (item) {
          if (p.bookingId) item.bookings.add(p.bookingId);
          item.gross += p.amountKobo;
          item.commission += p.platformAmountKobo - (p.serviceFeeKobo ?? 0);
          item.net += p.operatorAmountKobo;
        }
      }

      for (const r of refundRows) {
        const p = paymentRows.find((x) => x.id === r.paymentId);
        if (!p) continue;
        const item = lotsMap.get(p.lotId);
        if (item) {
          item.gross -= r.amountKobo;
          item.net -= r.amountKobo;
        }
      }

      const lotsSummary: MonthlyStatementLotSummary[] = [...lotsMap.values()].map((l) => ({
        lotId: l.lotId,
        lotName: l.lotName,
        bookingsCount: l.bookings.size,
        grossBookingKobo: l.gross,
        commissionKobo: l.commission,
        netOperatorKobo: l.net,
      }));

      const settlementRows = await db
        .select({
          id: settlements.id,
          providerSettlementId: settlements.providerSettlementId,
          amountKobo: settlements.amountKobo,
          status: settlements.status,
          settledAt: settlements.settledAt,
        })
        .from(settlements)
        .where(
          and(
            eq(settlements.operatorId, operatorId),
            gte(settlements.settledAt, startUtc),
            lt(settlements.settledAt, endUtc),
          ),
        );

      const mappedSettlements: SettlementSummary[] = settlementRows.map((s) => ({
        id: s.id,
        providerSettlementId: s.providerSettlementId,
        amountKobo: s.amountKobo ?? 0,
        status: s.status,
        settledAt: s.settledAt ? s.settledAt.toISOString() : null,
      }));

      const serviceFeeTotal = paymentRows.reduce((sum, p) => sum + (p.serviceFeeKobo ?? 0), 0);
      const totals = calculateStatementTotals(lotsSummary, mappedSettlements, serviceFeeTotal);
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
        lots: lotsSummary,
        settlements: mappedSettlements,
        generatedAt: new Date().toISOString(),
      };
    },

    async operatorsForMonthlyStatement(month) {
      const { startUtc, endUtc } = monthDateRange(month);

      const activeOps = await db
        .select({
          id: operators.id,
          legalName: operators.legalName,
          tradingName: operators.tradingName,
          contactEmail: operators.contactEmail,
        })
        .from(operators)
        .where(eq(operators.status, 'ACTIVE'));

      const results: { id: string; name: string; contactEmail: string }[] = [];

      for (const op of activeOps) {
        // Check if operator had payments, settlements, or an active payout account
        const [hasPayout] = await db
          .select({ id: payoutAccounts.id })
          .from(payoutAccounts)
          .where(and(eq(payoutAccounts.operatorId, op.id), eq(payoutAccounts.status, 'ACTIVE')))
          .limit(1);

        const [hasPayment] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.operatorId, op.id),
              eq(payments.status, 'SUCCEEDED'),
              gte(payments.paidAt, startUtc),
              lt(payments.paidAt, endUtc),
            ),
          )
          .limit(1);

        const [hasSettlement] = await db
          .select({ id: settlements.id })
          .from(settlements)
          .where(
            and(
              eq(settlements.operatorId, op.id),
              gte(settlements.settledAt, startUtc),
              lt(settlements.settledAt, endUtc),
            ),
          )
          .limit(1);

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
