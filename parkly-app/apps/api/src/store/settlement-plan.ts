import type { SettlementRecord, SettlementRow } from './types.js';

/** What recording one provider settlement changes; both stores apply it as is. */
export type SettlementPlan =
  | { kind: 'INSERT'; post: boolean }
  | { kind: 'UPDATE'; changes: Partial<SettlementRecord>; post: boolean }
  | { kind: 'NONE' };

const postable = (r: Pick<SettlementRecord, 'status' | 'amountKobo'>) =>
  r.status === 'SETTLED' && (r.amountKobo ?? 0) > 0;

const same = (a: SettlementRecord, b: SettlementRecord) =>
  a.status === b.status &&
  a.amountKobo === b.amountKobo &&
  a.grossKobo === b.grossKobo &&
  a.feesKobo === b.feesKobo &&
  (a.settledAt?.getTime() ?? null) === (b.settledAt?.getTime() ?? null) &&
  a.reviewReason === b.reviewReason &&
  a.subaccountCode === b.subaccountCode &&
  a.operatorId === b.operatorId;

/**
 * S7 task 3: a new or changed provider record is saved; a paid-out one with an
 * amount is posted once. Once posted it is never posted again: if the provider
 * later tells a different story the row goes to NEEDS_REVIEW for ops.
 */
export function planSettlement(
  existing: SettlementRow | null,
  incoming: SettlementRecord,
): SettlementPlan {
  if (!existing) return { kind: 'INSERT', post: postable(incoming) };

  if (existing.ledgerJournalId) {
    if (existing.status === 'NEEDS_REVIEW') return { kind: 'NONE' };
    if (incoming.status === 'SETTLED' && incoming.amountKobo === existing.amountKobo)
      return { kind: 'NONE' };
    return {
      kind: 'UPDATE',
      changes: {
        status: 'NEEDS_REVIEW',
        reviewReason: `Changed after it was posted: now ${incoming.status}, ${incoming.amountKobo ?? 'no'} kobo (posted ${existing.amountKobo ?? 0})`,
      },
      post: false,
    };
  }

  if (same(existing, incoming)) return { kind: 'NONE' };
  return { kind: 'UPDATE', changes: incoming, post: postable(incoming) };
}
