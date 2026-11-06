import { isBalanced, settlementJournal, type JournalLine } from '@parkly/domain/booking';
import type { Kobo } from '@parkly/domain/money';
import { randomUUID } from 'node:crypto';
import { planSettlement } from './settlement-plan.js';
import type { SettlementRow, Store } from './types.js';

/** In-memory provider payouts; mirrors drizzle-settlements through planSettlement. */
export class MemorySettlements {
  readonly rows: SettlementRow[] = [];
  readonly ledgerRows: (JournalLine & { journalId: string; settlementId: string })[] = [];

  readonly settlements: Store['settlements'] = {
    record: async (s, at) => {
      const existing =
        this.rows.find(
          (r) => r.provider === s.provider && r.providerSettlementId === s.providerSettlementId,
        ) ?? null;
      const plan = planSettlement(existing, s);
      if (plan.kind === 'NONE') return { outcome: 'UNCHANGED', posted: false };

      let row: SettlementRow;
      if (plan.kind === 'INSERT') {
        row = { id: randomUUID(), ...s, ledgerJournalId: null, postedAt: null };
        this.rows.push(row);
      } else {
        row = existing as SettlementRow;
        Object.assign(row, plan.changes);
      }
      const outcome = plan.kind === 'INSERT' ? 'NEW' : 'UPDATED';
      if (!plan.post) return { outcome, posted: false };

      const lines = settlementJournal({
        provider: s.provider,
        operatorId: s.operatorId,
        amountKobo: (s.amountKobo ?? 0) as Kobo,
      });
      if (!isBalanced(lines)) throw new Error('settlement journal is unbalanced');
      const journalId = randomUUID();
      for (const l of lines) this.ledgerRows.push({ ...l, journalId, settlementId: row.id });
      row.ledgerJournalId = journalId;
      row.postedAt = at;
      return { outcome, posted: true };
    },

    needingReview: async (limit) =>
      this.rows
        .filter((r) => r.status === 'NEEDS_REVIEW')
        .slice(0, limit)
        .map((r) => ({ ...r, raw: { ...r.raw } })),

    find: async (provider, providerSettlementId) => {
      const r = this.rows.find(
        (x) => x.provider === provider && x.providerSettlementId === providerSettlementId,
      );
      return r ? { ...r, raw: { ...r.raw } } : null;
    },
  };
}
