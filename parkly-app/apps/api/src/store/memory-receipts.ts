import { receiptNumber } from '@parkly/domain/booking';
import type { ReceiptRow, Store } from './types.js';

/** Key order doesn't matter, as with Postgres jsonb equality. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/** In-memory receipts, numbered per operator like the Postgres counter. */
export class MemoryReceipts {
  readonly rows: ReceiptRow[] = [];
  private readonly lastSeq = new Map<string, number>();

  readonly receipts: Store['receipts'] = {
    issue: async ({ bookingId, operatorId, content, at }) => {
      const existing = this.rows.find((r) => r.bookingId === bookingId);
      const frozen = structuredClone(content);
      if (existing) {
        if (canonical(existing.content) === canonical(frozen))
          return { ...existing, changed: false };
        Object.assign(existing, {
          content: frozen,
          revision: existing.revision + 1,
          revisedAt: at,
        });
        return { ...existing, changed: true };
      }
      const seq = (this.lastSeq.get(operatorId) ?? 0) + 1;
      this.lastSeq.set(operatorId, seq);
      const row: ReceiptRow = {
        bookingId,
        operatorId,
        number: receiptNumber(seq),
        revision: 1,
        issuedAt: at,
        revisedAt: at,
        content: frozen,
      };
      this.rows.push(row);
      return { ...row, changed: true };
    },
    find: async (bookingId) => {
      const r = this.rows.find((x) => x.bookingId === bookingId);
      return r ? { ...r } : null;
    },
  };
}
