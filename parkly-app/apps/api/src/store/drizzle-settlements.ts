import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { isBalanced, settlementJournal } from '@parkly/domain/booking';
import type { Kobo } from '@parkly/domain/money';
import { and, asc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { accountIds } from './drizzle-bookings.js';
import { planSettlement } from './settlement-plan.js';
import type { SettlementRow, Store } from './types.js';

const { settlements, ledgerEntries } = schema;

const columns = {
  id: settlements.id,
  provider: settlements.provider,
  providerSettlementId: settlements.providerSettlementId,
  operatorId: settlements.operatorId,
  subaccountCode: settlements.subaccountCode,
  status: settlements.status,
  amountKobo: settlements.amountKobo,
  grossKobo: settlements.grossKobo,
  feesKobo: settlements.feesKobo,
  settledAt: settlements.settledAt,
  raw: settlements.raw,
  reviewReason: settlements.reviewReason,
  ledgerJournalId: settlements.ledgerJournalId,
  postedAt: settlements.postedAt,
};

const asRow = (r: Record<string, unknown>) => r as unknown as SettlementRow;

/** Provider payouts (S7 task 3): saved by provider id, posted to the ledger once. */
export function drizzleSettlements(db: Db): Store['settlements'] {
  return {
    async record(s, at) {
      return db.transaction(async (tx) => {
        const [found] = await tx
          .select(columns)
          .from(settlements)
          .where(
            and(
              eq(settlements.provider, s.provider),
              eq(settlements.providerSettlementId, s.providerSettlementId),
            ),
          )
          .for('update');
        const existing = found ? asRow(found) : null;
        const plan = planSettlement(existing, s);
        if (plan.kind === 'NONE') return { outcome: 'UNCHANGED' as const, posted: false };

        let id = existing?.id ?? uuidv7();
        if (plan.kind === 'INSERT') {
          // A concurrent run may insert the same settlement first: keep theirs.
          const inserted = await tx
            .insert(settlements)
            .values({ id, ...s, updatedAt: at })
            .onConflictDoNothing({
              target: [settlements.provider, settlements.providerSettlementId],
            })
            .returning({ id: settlements.id });
          if (!inserted[0]) return { outcome: 'UNCHANGED' as const, posted: false };
          id = inserted[0].id;
        } else {
          await tx
            .update(settlements)
            .set({ ...plan.changes, updatedAt: at })
            .where(eq(settlements.id, id));
        }

        if (!plan.post)
          return { outcome: plan.kind === 'INSERT' ? 'NEW' : 'UPDATED', posted: false };
        const lines = settlementJournal({
          provider: s.provider,
          operatorId: s.operatorId,
          amountKobo: (s.amountKobo ?? 0) as Kobo,
        });
        if (!isBalanced(lines)) throw new Error('settlement journal is unbalanced');
        const ids = await accountIds(
          tx,
          lines.map((l) => l.account),
        );
        const journalId = uuidv7();
        await tx.insert(ledgerEntries).values(
          lines.map((l) => ({
            id: uuidv7(),
            journalId,
            accountId: ids.get(l.account) ?? '',
            direction: l.direction,
            amountKobo: l.amountKobo,
            settlementId: id,
            description: `settlement ${s.provider} ${s.providerSettlementId}`,
          })),
        );
        await tx
          .update(settlements)
          .set({ ledgerJournalId: journalId, postedAt: at, updatedAt: at })
          .where(eq(settlements.id, id));
        return {
          outcome: plan.kind === 'INSERT' ? ('NEW' as const) : ('UPDATED' as const),
          posted: true,
        };
      });
    },

    async needingReview(limit) {
      const rows = await db
        .select(columns)
        .from(settlements)
        .where(eq(settlements.status, 'NEEDS_REVIEW'))
        .orderBy(asc(settlements.createdAt))
        .limit(limit);
      return rows.map(asRow);
    },

    async find(provider, providerSettlementId) {
      const [r] = await db
        .select(columns)
        .from(settlements)
        .where(
          and(
            eq(settlements.provider, provider),
            eq(settlements.providerSettlementId, providerSettlementId),
          ),
        );
      return r ? asRow(r) : null;
    },
  };
}
