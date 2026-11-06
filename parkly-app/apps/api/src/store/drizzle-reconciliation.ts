import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { and, desc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type {
  ReconciliationItemRecord,
  ReconciliationItemRow,
  ReconciliationRunRecord,
  ReconciliationRunRow,
  Store,
} from './types.js';

const { reconciliationRuns, reconciliationItems } = schema;

const runColumns = {
  id: reconciliationRuns.id,
  businessDate: reconciliationRuns.businessDate,
  provider: reconciliationRuns.provider,
  status: reconciliationRuns.status,
  totalInternal: reconciliationRuns.totalInternal,
  totalProvider: reconciliationRuns.totalProvider,
  matchedCount: reconciliationRuns.matchedCount,
  mismatchedCount: reconciliationRuns.mismatchedCount,
  startedAt: reconciliationRuns.startedAt,
  finishedAt: reconciliationRuns.finishedAt,
  error: reconciliationRuns.error,
  createdAt: reconciliationRuns.createdAt,
  updatedAt: reconciliationRuns.updatedAt,
};

const itemColumns = {
  id: reconciliationItems.id,
  runId: reconciliationItems.runId,
  paymentId: reconciliationItems.paymentId,
  providerReference: reconciliationItems.providerReference,
  result: reconciliationItems.result,
  details: reconciliationItems.details,
  resolvedBy: reconciliationItems.resolvedBy,
  resolvedAt: reconciliationItems.resolvedAt,
  resolutionNotes: reconciliationItems.resolutionNotes,
  createdAt: reconciliationItems.createdAt,
};

const asRunRow = (r: Record<string, unknown>) => r as unknown as ReconciliationRunRow;
const asItemRow = (r: Record<string, unknown>) => r as unknown as ReconciliationItemRow;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function upsertRun(db: Db | Tx, run: ReconciliationRunRecord): Promise<ReconciliationRunRow> {
  const now = new Date();
  const [upserted] = await db
    .insert(reconciliationRuns)
    .values({
      id: uuidv7(),
      businessDate: run.businessDate,
      provider: run.provider,
      status: run.status,
      totalInternal: run.totalInternal,
      totalProvider: run.totalProvider,
      matchedCount: run.matchedCount,
      mismatchedCount: run.mismatchedCount,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      error: run.error,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [reconciliationRuns.provider, reconciliationRuns.businessDate],
      set: {
        status: run.status,
        totalInternal: run.totalInternal,
        totalProvider: run.totalProvider,
        matchedCount: run.matchedCount,
        mismatchedCount: run.mismatchedCount,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        error: run.error,
        updatedAt: now,
      },
    })
    .returning(runColumns);
  if (!upserted) throw new Error('reconciliation run upsert returned no row');
  return asRunRow(upserted);
}

export function drizzleReconciliation(db: Db): Store['reconciliation'] {
  return {
    saveRun: (run) => upsertRun(db, run),

    async recordRun(run, items) {
      return db.transaction(async (tx) => {
        const saved = await upsertRun(tx, run);
        const resolved = await tx
          .select({
            providerReference: reconciliationItems.providerReference,
            result: reconciliationItems.result,
          })
          .from(reconciliationItems)
          .where(
            and(eq(reconciliationItems.runId, saved.id), isNotNull(reconciliationItems.resolvedAt)),
          );
        const kept = new Set(resolved.map((r) => `${r.providerReference}|${r.result}`));
        await tx
          .delete(reconciliationItems)
          .where(
            and(eq(reconciliationItems.runId, saved.id), isNull(reconciliationItems.resolvedAt)),
          );
        const fresh = items.filter((i) => !kept.has(`${i.providerReference}|${i.result}`));
        if (fresh.length > 0) {
          const now = new Date();
          await tx.insert(reconciliationItems).values(
            fresh.map((item) => ({
              id: uuidv7(),
              runId: saved.id,
              paymentId: item.paymentId,
              providerReference: item.providerReference,
              result: item.result,
              details: item.details,
              resolvedBy: null,
              resolvedAt: null,
              resolutionNotes: null,
              createdAt: now,
            })),
          );
        }
        return saved;
      });
    },

    async findRun(provider, businessDate): Promise<ReconciliationRunRow | null> {
      const [found] = await db
        .select(runColumns)
        .from(reconciliationRuns)
        .where(
          and(
            eq(reconciliationRuns.provider, provider),
            eq(reconciliationRuns.businessDate, businessDate),
          ),
        );
      return found ? asRunRow(found) : null;
    },

    async findRunById(id): Promise<ReconciliationRunRow | null> {
      const [found] = await db
        .select(runColumns)
        .from(reconciliationRuns)
        .where(eq(reconciliationRuns.id, id));
      return found ? asRunRow(found) : null;
    },

    async saveItems(runId: string, items: ReconciliationItemRecord[]): Promise<void> {
      if (items.length === 0) return;
      const now = new Date();
      await db.insert(reconciliationItems).values(
        items.map((item) => ({
          id: uuidv7(),
          runId,
          paymentId: item.paymentId,
          providerReference: item.providerReference,
          result: item.result,
          details: item.details,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNotes: null,
          createdAt: now,
        })),
      );
    },

    async listRuns(query): Promise<ReconciliationRunRow[]> {
      const conditions = [];
      if (query.before) {
        const cursor = or(
          lt(reconciliationRuns.createdAt, query.before.createdAt),
          and(
            eq(reconciliationRuns.createdAt, query.before.createdAt),
            lt(reconciliationRuns.id, query.before.id),
          ),
        );
        if (cursor) conditions.push(cursor);
      }
      const rows = await db
        .select(runColumns)
        .from(reconciliationRuns)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(reconciliationRuns.createdAt), desc(reconciliationRuns.id))
        .limit(query.limit);
      return rows.map(asRunRow);
    },

    async listItems(query): Promise<ReconciliationItemRow[]> {
      const conditions = [eq(reconciliationItems.runId, query.runId)];
      if (query.result) {
        conditions.push(eq(reconciliationItems.result, query.result));
      }
      if (query.unresolvedOnly) {
        conditions.push(isNull(reconciliationItems.resolvedAt));
      }
      if (query.before) {
        const cursor = or(
          lt(reconciliationItems.createdAt, query.before.createdAt),
          and(
            eq(reconciliationItems.createdAt, query.before.createdAt),
            lt(reconciliationItems.id, query.before.id),
          ),
        );
        if (cursor) conditions.push(cursor);
      }
      const rows = await db
        .select(itemColumns)
        .from(reconciliationItems)
        .where(and(...conditions))
        .orderBy(desc(reconciliationItems.createdAt), desc(reconciliationItems.id))
        .limit(query.limit);
      return rows.map(asItemRow);
    },

    async findItem(id): Promise<ReconciliationItemRow | null> {
      const [found] = await db
        .select(itemColumns)
        .from(reconciliationItems)
        .where(eq(reconciliationItems.id, id));
      return found ? asItemRow(found) : null;
    },

    async resolveItem(id, resolution): Promise<ReconciliationItemRow | null> {
      const [updated] = await db
        .update(reconciliationItems)
        .set({
          resolvedBy: resolution.resolvedBy,
          resolvedAt: resolution.resolvedAt,
          resolutionNotes: resolution.notes,
        })
        // Only an open item: a second click or a race can't overwrite who resolved it.
        .where(and(eq(reconciliationItems.id, id), isNull(reconciliationItems.resolvedAt)))
        .returning(itemColumns);
      return updated ? asItemRow(updated) : null;
    },
  };
}
