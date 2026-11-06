import { randomUUID } from 'node:crypto';
import type {
  ReconciliationItemRecord,
  ReconciliationItemRow,
  ReconciliationRunRecord,
  ReconciliationRunRow,
  Store,
} from './types.js';

export class MemoryReconciliation {
  constructor(
    private readonly ledgerLines: () => readonly {
      account: string;
      direction: 'DEBIT' | 'CREDIT';
      amountKobo: number;
      paymentId: string;
    }[] = () => [],
  ) {}

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

    clearingDebits: async (provider, paymentIds) => {
      const out = new Map<string, number>();
      for (const l of this.ledgerLines()) {
        if (!paymentIds.includes(l.paymentId)) continue;
        if (l.direction !== 'DEBIT' || l.account !== `PROVIDER_CLEARING:${provider}`) continue;
        out.set(l.paymentId, (out.get(l.paymentId) ?? 0) + l.amountKobo);
      }
      return out;
    },

    recordRun: async (run, items) => {
      const saved = await this.reconciliation.saveRun(run);
      const resolved = new Set(
        this.itemRows
          .filter((i) => i.runId === saved.id && i.resolvedAt)
          .map((i) => `${i.providerReference}|${i.result}`),
      );
      for (let i = this.itemRows.length - 1; i >= 0; i--) {
        const row = this.itemRows[i];
        if (row && row.runId === saved.id && !row.resolvedAt) this.itemRows.splice(i, 1);
      }
      await this.reconciliation.saveItems(
        saved.id,
        items.filter((i) => !resolved.has(`${i.providerReference}|${i.result}`)),
      );
      return saved;
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
      // As Postgres: only an open item is resolved, so a second click can't overwrite.
      if (!found || found.resolvedAt) return null;
      found.resolvedBy = resolution.resolvedBy;
      found.resolvedAt = resolution.resolvedAt;
      found.resolutionNotes = resolution.notes;
      return { ...found, details: { ...found.details } };
    },
  };
}
