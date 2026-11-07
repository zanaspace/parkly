import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import type { EarningsLedgerLine } from '@parkly/domain/operator';
import { and, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';
import {
  buildEarningsReport,
  buildStatement,
  earningsAccounts,
  lagosWindow,
  monthWindow,
  type PayoutRow,
} from './earnings-report.js';
import type { Store } from './types.js';

const {
  payments,
  bookings,
  settlements,
  lots,
  operators,
  payoutAccounts,
  ledgerEntries,
  ledgerAccounts,
} = schema;

/**
 * Revenue reports read the ledger (doc 20 S7: report totals equal ledger sums):
 * the operator's payments' lines on commission, service fee and their payable,
 * posted in the window. Refunds are dated when their journal was posted.
 */
export function drizzleReports(db: Db): Store['reports'] {
  async function earningsLines(
    operatorId: string,
    startUtc: Date,
    endUtc: Date,
    lotId?: string,
  ): Promise<EarningsLedgerLine[]> {
    const where: SQL[] = [
      eq(payments.operatorId, operatorId),
      inArray(ledgerAccounts.code, earningsAccounts(operatorId)),
      gte(ledgerEntries.createdAt, startUtc),
      lt(ledgerEntries.createdAt, endUtc),
    ];
    if (lotId) where.push(eq(bookings.lotId, lotId));
    return db
      .select({
        account: ledgerAccounts.code,
        direction: ledgerEntries.direction,
        amountKobo: ledgerEntries.amountKobo,
        postedAt: ledgerEntries.createdAt,
        paymentKind: payments.kind,
        bookingId: payments.bookingId,
        lotId: bookings.lotId,
      })
      .from(ledgerEntries)
      .innerJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
      .innerJoin(payments, eq(ledgerEntries.paymentId, payments.id))
      .leftJoin(bookings, eq(payments.bookingId, bookings.id))
      .where(and(...where));
  }

  function payouts(operatorId: string, startUtc: Date, endUtc: Date): Promise<PayoutRow[]> {
    return db
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
  }

  return {
    async operatorEarnings({ operatorId, from, to, lotId }) {
      const { startUtc, endUtc } = lagosWindow(from, to);
      const [lines, rows] = await Promise.all([
        earningsLines(operatorId, startUtc, endUtc, lotId),
        payouts(operatorId, startUtc, endUtc),
      ]);
      return buildEarningsReport({ operatorId, from, to, lotId, lines, payouts: rows });
    },

    async monthlyStatement({ operatorId, month, lotId }) {
      const [op] = await db
        .select({ legalName: operators.legalName, tradingName: operators.tradingName })
        .from(operators)
        .where(eq(operators.id, operatorId));
      if (!op) return null;

      const { startUtc, endUtc } = monthWindow(month);
      const [payout] = await db
        .select({
          bankName: payoutAccounts.bankName,
          accountNumberLast4: payoutAccounts.accountNumberLast4,
          accountName: payoutAccounts.accountName,
        })
        .from(payoutAccounts)
        .where(eq(payoutAccounts.operatorId, operatorId));
      const [lines, rows, lotRows] = await Promise.all([
        earningsLines(operatorId, startUtc, endUtc, lotId),
        payouts(operatorId, startUtc, endUtc),
        db
          .select({ id: lots.id, name: lots.name })
          .from(lots)
          .where(eq(lots.operatorId, operatorId)),
      ]);

      return buildStatement({
        operatorId,
        month,
        operatorName: op.legalName || op.tradingName,
        payoutAccount: payout ?? null,
        lines,
        lotNames: new Map(lotRows.map((l) => [l.id, l.name])),
        payouts: rows,
        generatedAt: new Date(),
      });
    },

    async operatorsForMonthlyStatement(month) {
      const { startUtc, endUtc } = monthWindow(month);

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
