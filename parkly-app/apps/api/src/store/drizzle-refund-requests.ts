import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { RefundRequestRow, Store } from './types.js';

const { refundRequests } = schema;

const columns = {
  id: refundRequests.id,
  bookingId: refundRequests.bookingId,
  amountKobo: refundRequests.amountKobo,
  reason: refundRequests.reason,
  note: refundRequests.note,
  status: refundRequests.status,
  requestedBy: refundRequests.requestedBy,
  decidedBy: refundRequests.decidedBy,
  decidedAt: refundRequests.decidedAt,
  decisionNote: refundRequests.decisionNote,
  createdAt: refundRequests.createdAt,
};

/** FR-ADM-003: staff refunds over the threshold, waiting for a second finance admin. */
export function drizzleRefundRequests(db: Db): Store['refundRequests'] {
  return {
    async create(input, at) {
      const [row] = await db
        .insert(refundRequests)
        .values({ id: uuidv7(), ...input, createdAt: at, updatedAt: at })
        .returning(columns);
      if (!row) throw new Error('refund request not saved');
      return row as RefundRequestRow;
    },

    async find(id) {
      const [row] = await db.select(columns).from(refundRequests).where(eq(refundRequests.id, id));
      return (row as RefundRequestRow | undefined) ?? null;
    },

    async list({ status, bookingId, limit }) {
      const where: SQL[] = [];
      if (status) where.push(eq(refundRequests.status, status));
      if (bookingId) where.push(eq(refundRequests.bookingId, bookingId));
      const rows = await db
        .select(columns)
        .from(refundRequests)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(refundRequests.createdAt))
        .limit(limit);
      return rows as RefundRequestRow[];
    },

    async decide(id, { status, decidedBy, note }, at) {
      // Only a pending request changes, so of two approvers at once only one wins.
      const [row] = await db
        .update(refundRequests)
        .set({ status, decidedBy, decidedAt: at, decisionNote: note, updatedAt: at })
        .where(and(eq(refundRequests.id, id), eq(refundRequests.status, 'PENDING_APPROVAL')))
        .returning(columns);
      return (row as RefundRequestRow | undefined) ?? null;
    },

    async fail(id, at) {
      await db
        .update(refundRequests)
        .set({ status: 'FAILED', updatedAt: at })
        .where(and(eq(refundRequests.id, id), eq(refundRequests.status, 'APPROVED')));
    },
  };
}
