import type {
  DailyEarningsItem,
  MonthlyStatement,
  OperatorEarningsReport,
  SettlementSummary,
} from '@parkly/contracts';
import { LEDGER_ACCOUNTS, operatorPayable } from '@parkly/domain/booking';
import {
  calculateEarningsTotals,
  calculateStatementTotals,
  dailyLedgerEarnings,
  daySettlementStatus,
  type EarningsLedgerLine,
  ledgerEarnings,
  lotLedgerEarnings,
} from '@parkly/domain/operator';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';

/**
 * Shared by DrizzleStore and MemoryStore: each fetches the operator's ledger
 * lines and payouts for the window, and this turns them into the report, so
 * both stores give the same answer by construction.
 */

const DAY_MS = 24 * 60 * 60_000;

/** The ledger accounts that make up what a driver paid for an operator. */
export const earningsAccounts = (operatorId: string): string[] => [
  LEDGER_ACCOUNTS.COMMISSION,
  LEDGER_ACCOUNTS.SERVICE_FEE,
  operatorPayable(operatorId),
];

/** UTC bounds of Lagos days `from`..`to`, inclusive. */
export function lagosWindow(from: string, to: string): { startUtc: Date; endUtc: Date } {
  return {
    startUtc: lagosDayStart(from),
    endUtc: new Date(lagosDayStart(to).getTime() + DAY_MS),
  };
}

export function monthWindow(month: string): {
  from: string;
  to: string;
  startUtc: Date;
  endUtc: Date;
} {
  const [y = 2026, m = 1] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, ...lagosWindow(from, to) };
}

function enumerateDays(fromKey: string, toKey: string): string[] {
  const days: string[] = [];
  const last = lagosDayStart(toKey).getTime();
  for (let t = lagosDayStart(fromKey).getTime(); t <= last; t += DAY_MS) {
    days.push(lagosDateKey(new Date(t)));
  }
  return days;
}

/** A payout to the operator, as the stores read it. */
export type PayoutRow = {
  id: string;
  providerSettlementId: string;
  amountKobo: number | null;
  status: SettlementSummary['status'];
  settledAt: Date | null;
};

const summary = (s: PayoutRow): SettlementSummary => ({
  id: s.id,
  providerSettlementId: s.providerSettlementId,
  amountKobo: s.amountKobo ?? 0,
  status: s.status,
  settledAt: s.settledAt?.toISOString() ?? null,
});

export function buildEarningsReport(input: {
  operatorId: string;
  from: string;
  to: string;
  lotId?: string;
  lines: readonly EarningsLedgerLine[];
  payouts: readonly PayoutRow[];
}): OperatorEarningsReport {
  const { operatorId, from, to } = input;
  const days = enumerateDays(from, to);
  const byDay = dailyLedgerEarnings(input.lines, operatorId, days);

  const daily: DailyEarningsItem[] = days.map((date) => {
    const payouts = input.payouts.filter((s) => s.settledAt && lagosDateKey(s.settledAt) === date);
    const amounts = byDay.get(date) ?? ledgerEarnings([], operatorId);
    return {
      date,
      ...amounts,
      // Only money that reached the bank counts as paid out (review: failed and
      // pending payouts were added in before).
      settlementKobo: payouts
        .filter((s) => s.status === 'SETTLED')
        .reduce((n, s) => n + (s.amountKobo ?? 0), 0),
      settlementStatus: daySettlementStatus(payouts.map((s) => s.status)),
      settlementReferences: payouts.map((s) => s.providerSettlementId),
    };
  });

  return {
    operatorId,
    from,
    to,
    lotId: input.lotId ?? null,
    totals: calculateEarningsTotals(daily),
    daily,
    settlements: input.payouts.map(summary),
  };
}

export function buildStatement(input: {
  operatorId: string;
  month: string;
  operatorName: string;
  payoutAccount: MonthlyStatement['payoutAccount'];
  lines: readonly EarningsLedgerLine[];
  lotNames: ReadonlyMap<string, string>;
  payouts: readonly PayoutRow[];
  generatedAt: Date;
}): MonthlyStatement {
  const { operatorId, month } = input;
  const { from, to } = monthWindow(month);
  const settlements = input.payouts.map(summary);
  return {
    statementNumber: `STM-${month.replace('-', '')}-${operatorId.slice(0, 8).toUpperCase()}`,
    month,
    operatorId,
    operatorName: input.operatorName,
    payoutAccount: input.payoutAccount,
    periodStart: from,
    periodEnd: to,
    totals: calculateStatementTotals(ledgerEarnings(input.lines, operatorId), settlements),
    lots: lotLedgerEarnings(input.lines, operatorId, input.lotNames),
    settlements,
    generatedAt: input.generatedAt.toISOString(),
  };
}
