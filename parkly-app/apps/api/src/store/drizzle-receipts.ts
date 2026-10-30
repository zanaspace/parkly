import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { receiptNumber } from '@parkly/domain/booking';
import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { ReceiptRow, Store } from './types.js';

const { receipts, receiptCounters } = schema;

const columns = {
  bookingId: receipts.bookingId,
  operatorId: receipts.operatorId,
  number: receipts.number,
  revision: receipts.revision,
  issuedAt: receipts.issuedAt,
  revisedAt: receipts.revisedAt,
  content: receipts.content,
};

/** A unique-key clash; drizzle may wrap the driver's error. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Stored receipts in Postgres (FR-BOOK-009, gap review L-5). */
export function drizzleReceipts(db: Db): Store['receipts'] {
  const issueOnce = (input: Parameters<Store['receipts']['issue']>[0]) => {
    const { bookingId, operatorId, content, at } = input;
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          ...columns,
          // jsonb equality ignores key order and whitespace.
          same: sql<boolean>`${receipts.content} = ${JSON.stringify(content)}::jsonb`,
        })
        .from(receipts)
        .where(eq(receipts.bookingId, bookingId))
        .for('update');
      if (existing) {
        const { same, ...row } = existing;
        if (same) return { ...(row as ReceiptRow), changed: false };
        const [updated] = await tx
          .update(receipts)
          .set({ content, revision: sql`${receipts.revision} + 1`, revisedAt: at })
          .where(eq(receipts.bookingId, bookingId))
          .returning(columns);
        if (!updated) throw new Error('receipt update failed');
        return { ...(updated as ReceiptRow), changed: true };
      }
      // The operator's next number, taken under the counter row's lock.
      const [counter] = await tx
        .insert(receiptCounters)
        .values({ operatorId, lastSeq: 1 })
        .onConflictDoUpdate({
          target: receiptCounters.operatorId,
          set: { lastSeq: sql`${receiptCounters.lastSeq} + 1` },
        })
        .returning({ seq: receiptCounters.lastSeq });
      if (!counter) throw new Error('receipt counter failed');
      const [created] = await tx
        .insert(receipts)
        .values({
          id: uuidv7(),
          bookingId,
          operatorId,
          seq: counter.seq,
          number: receiptNumber(counter.seq),
          issuedAt: at,
          revisedAt: at,
          content,
        })
        .returning(columns);
      if (!created) throw new Error('receipt insert failed');
      return { ...(created as ReceiptRow), changed: true };
    });
  };

  return {
    async issue(input) {
      try {
        return await issueOnce(input);
      } catch (err) {
        // Two first issues at once (webhook and app verify): the loser's number
        // rolled back with it; the second try finds the winner's receipt.
        if (!isUniqueViolation(err)) throw err;
        return issueOnce(input);
      }
    },

    async find(bookingId) {
      const [row] = await db
        .select(columns)
        .from(receipts)
        .where(eq(receipts.bookingId, bookingId));
      return (row as ReceiptRow | undefined) ?? null;
    },
  };
}
