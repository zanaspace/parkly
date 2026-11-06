import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { and, desc, eq, sql } from 'drizzle-orm';
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

export function drizzleReconciliation(db: Db): Store['reconciliation'] {
  return {
    async saveRun(run: ReconciliationRunRecord): Promise<ReconciliationRunRow> {
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
        conditions.push(
          sql`(${reconciliationRuns.createdAt}, ${reconciliationRuns.id}) < (${query.before.createdAt}, ${query.before.id})`,
        );
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
        conditions.push(sql`${reconciliationItems.resolvedAt} IS NULL`);
      }
      if (query.before) {
        conditions.push(
          sql`(${reconciliationItems.createdAt}, ${reconciliationItems.id}) < (${query.before.createdAt}, ${query.before.id})`,
        );
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
        .where(eq(reconciliationItems.id, id))
        .returning(itemColumns);
      return updated ? asItemRow(updated) : null;
    },
  };
}
