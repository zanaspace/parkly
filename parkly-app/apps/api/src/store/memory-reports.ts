import type { EarningsLedgerLine, PlatformLedgerLine } from '@parkly/domain/operator';
import {
  buildEarningsReport,
  buildPlatformReport,
  buildStatement,
  earningsAccounts,
  lagosWindow,
  monthWindow,
  OPERATOR_PAYABLE_PREFIX,
  PLATFORM_ACCOUNTS,
  type PayoutRow,
} from './earnings-report.js';
import type { MemoryBookings } from './memory-bookings.js';
import type { MemorySettlements } from './memory-settlements.js';
import type { LotRow, MemberRow, OperatorRow, PayoutAccountRow, Store, UserRow } from './types.js';

/** In-memory revenue reports; reads the ledger the same way as drizzle-reports. */
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

  private earningsLines(
    operatorId: string,
    startUtc: Date,
    endUtc: Date,
    lotId?: string,
  ): EarningsLedgerLine[] {
    const accounts = new Set(earningsAccounts(operatorId));
    const payments = new Map(this.deps.bookings.paymentRows.map((p) => [p.id, p]));
    const bookingLots = new Map(this.deps.bookings.bookingRows.map((b) => [b.id, b.lotId]));
    const out: EarningsLedgerLine[] = [];
    for (const l of this.deps.bookings.ledgerRows) {
      const p = payments.get(l.paymentId);
      if (!p || p.operatorId !== operatorId || !accounts.has(l.account)) continue;
      if (l.createdAt < startUtc || l.createdAt >= endUtc) continue;
      const lot = p.bookingId ? (bookingLots.get(p.bookingId) ?? null) : null;
      if (lotId && lot !== lotId) continue;
      out.push({
        account: l.account,
        direction: l.direction,
        amountKobo: l.amountKobo,
        postedAt: l.createdAt,
        paymentKind: p.kind ?? 'BOOKING',
        bookingId: p.bookingId ?? null,
        lotId: lot,
      });
    }
    return out;
  }

  private payouts(operatorId: string, startUtc: Date, endUtc: Date): PayoutRow[] {
    return this.deps.settlementStore.rows
      .filter(
        (s) =>
          s.operatorId === operatorId &&
          s.settledAt !== null &&
          s.settledAt >= startUtc &&
          s.settledAt < endUtc,
      )
      .map((s) => ({
        id: s.id,
        providerSettlementId: s.providerSettlementId,
        amountKobo: s.amountKobo,
        status: s.status,
        settledAt: s.settledAt,
      }));
  }

  readonly reports: Store['reports'] = {
    operatorEarnings: async ({ operatorId, from, to, lotId }) => {
      const { startUtc, endUtc } = lagosWindow(from, to);
      return buildEarningsReport({
        operatorId,
        from,
        to,
        lotId,
        lines: this.earningsLines(operatorId, startUtc, endUtc, lotId),
        payouts: this.payouts(operatorId, startUtc, endUtc),
      });
    },

    monthlyStatement: async ({ operatorId, month, lotId }) => {
      const op = this.deps.operatorRows.get(operatorId);
      if (!op) return null;
      const { startUtc, endUtc } = monthWindow(month);
      const payout = this.deps.payoutRows.get(operatorId);
      const lotNames = new Map(
        [...this.deps.lotRows.values()]
          .filter((l) => l.operatorId === operatorId)
          .map((l) => [l.id, l.name]),
      );
      return buildStatement({
        operatorId,
        month,
        operatorName: op.legalName || op.tradingName,
        payoutAccount: payout
          ? {
              bankName: payout.bankName,
              accountNumberLast4: payout.accountNumberLast4,
              accountName: payout.accountName,
            }
          : null,
        lines: this.earningsLines(operatorId, startUtc, endUtc, lotId),
        lotNames,
        payouts: this.payouts(operatorId, startUtc, endUtc),
        generatedAt: new Date(),
      });
    },

    platformEarnings: async ({ from, to }) => {
      const { startUtc, endUtc } = lagosWindow(from, to);
      const payments = new Map(this.deps.bookings.paymentRows.map((p) => [p.id, p]));
      const bookingLots = new Map(this.deps.bookings.bookingRows.map((b) => [b.id, b.lotId]));
      const lines: PlatformLedgerLine[] = [];
      for (const l of this.deps.bookings.ledgerRows) {
        const p = payments.get(l.paymentId);
        if (!p) continue;
        if (
          !PLATFORM_ACCOUNTS.includes(l.account as (typeof PLATFORM_ACCOUNTS)[number]) &&
          !l.account.startsWith(OPERATOR_PAYABLE_PREFIX)
        )
          continue;
        if (l.createdAt < startUtc || l.createdAt >= endUtc) continue;
        lines.push({
          account: l.account,
          direction: l.direction,
          amountKobo: l.amountKobo,
          postedAt: l.createdAt,
          paymentKind: p.kind ?? 'BOOKING',
          bookingId: p.bookingId ?? null,
          lotId: p.bookingId ? (bookingLots.get(p.bookingId) ?? null) : null,
          operatorId: p.operatorId,
        });
      }
      const operators = new Map(
        [...this.deps.operatorRows.values()].map((o) => [
          o.id,
          { name: o.tradingName || o.legalName, commissionBps: o.commissionBps },
        ]),
      );
      return buildPlatformReport({ from, to, lines, operators });
    },

    operatorsForMonthlyStatement: async (month) => {
      const { startUtc, endUtc } = monthWindow(month);

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
