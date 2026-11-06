import { randomUUID } from 'node:crypto';
import type {
  ReconciliationItemRecord,
  ReconciliationItemRow,
  ReconciliationRunRecord,
  ReconciliationRunRow,
  Store,
} from './types.js';

export class MemoryReconciliation {
  readonly runRows: ReconciliationRunRow[] = [];
  readonly itemRows: ReconciliationItemRow[] = [];

  readonly reconciliation: Store['reconciliation'] = {
    saveRun: async (run: ReconciliationRunRecord): Promise<ReconciliationRunRow> => {
      const existing = this.runRows.find(
        (r) => r.provider === run.provider && r.businessDate === run.businessDate,
      );
      const now = new Date();
      if (existing) {
        Object.assign(existing, run, { updatedAt: now });
        return { ...existing };
      }
      const newRow: ReconciliationRunRow = {
        id: randomUUID(),
        ...run,
        createdAt: now,
        updatedAt: now,
      };
      this.runRows.push(newRow);
      return { ...newRow };
    },

    findRun: async (provider, businessDate): Promise<ReconciliationRunRow | null> => {
      const found = this.runRows.find(
        (r) => r.provider === provider && r.businessDate === businessDate,
      );
      return found ? { ...found } : null;
    },

    findRunById: async (id): Promise<ReconciliationRunRow | null> => {
      const found = this.runRows.find((r) => r.id === id);
      return found ? { ...found } : null;
    },

    saveItems: async (runId, items: ReconciliationItemRecord[]): Promise<void> => {
      const now = new Date();
      for (const item of items) {
        this.itemRows.push({
          id: randomUUID(),
          runId,
          paymentId: item.paymentId,
          providerReference: item.providerReference,
          result: item.result,
          details: item.details,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNotes: null,
          createdAt: now,
        });
      }
    },

    listRuns: async (query): Promise<ReconciliationRunRow[]> => {
      let filtered = [...this.runRows].sort((a, b) => {
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        return timeDiff !== 0 ? timeDiff : b.id.localeCompare(a.id);
      });
      if (query.before) {
        const beforeTime = query.before.createdAt.getTime();
        const beforeId = query.before.id;
        filtered = filtered.filter((r) => {
          const rTime = r.createdAt.getTime();
          return rTime < beforeTime || (rTime === beforeTime && r.id < beforeId);
        });
      }
      return filtered.slice(0, query.limit).map((r) => ({ ...r }));
    },

    listItems: async (query): Promise<ReconciliationItemRow[]> => {
      let filtered = this.itemRows.filter((item) => item.runId === query.runId);
      if (query.result) {
        filtered = filtered.filter((item) => item.result === query.result);
      }
      if (query.unresolvedOnly) {
        filtered = filtered.filter((item) => item.resolvedAt === null);
      }
      filtered.sort((a, b) => {
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        return timeDiff !== 0 ? timeDiff : b.id.localeCompare(a.id);
      });
      if (query.before) {
        const beforeTime = query.before.createdAt.getTime();
        const beforeId = query.before.id;
        filtered = filtered.filter((r) => {
          const rTime = r.createdAt.getTime();
          return rTime < beforeTime || (rTime === beforeTime && r.id < beforeId);
        });
      }
      return filtered.slice(0, query.limit).map((r) => ({ ...r, details: { ...r.details } }));
    },

    findItem: async (id): Promise<ReconciliationItemRow | null> => {
      const found = this.itemRows.find((i) => i.id === id);
      return found ? { ...found, details: { ...found.details } } : null;
    },

    resolveItem: async (id, resolution): Promise<ReconciliationItemRow | null> => {
      const found = this.itemRows.find((i) => i.id === id);
      if (!found) return null;
      found.resolvedBy = resolution.resolvedBy;
      found.resolvedAt = resolution.resolvedAt;
      found.resolutionNotes = resolution.notes;
      return { ...found, details: { ...found.details } };
    },
  };
}
