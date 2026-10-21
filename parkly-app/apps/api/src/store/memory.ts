import type { RoleGrant } from '@parkly/domain/authz';
import { randomUUID } from 'node:crypto';
import {
  DsrAlreadyOpenError,
  DuplicatePlateError,
  OperatorExistsError,
  type AuditRow,
  type FileRow,
  type KybDocumentRow,
  type PayoutAccountRow,
  type OperatorRow,
  type ConsentType,
  type Store,
  type UserRow,
  type VehicleRow,
} from './types.js';

type Device = Parameters<Store['devices']['upsert']>[0] & { revokedAt: Date | null };
type Consent = { userId: string; type: ConsentType; version: string; granted: boolean; at: number };

/** In-memory Store for route tests. Mirrors the DB constraints the API relies on. */
export class MemoryStore implements Store {
  readonly userRows = new Map<
    string,
    UserRow & { phoneHash?: Buffer | null; emailHash?: Buffer | null }
  >();
  readonly roleRows: (RoleGrant & { userId: string })[] = [];
  readonly consentRows: Consent[] = [];
  readonly vehicleRows: (VehicleRow & { deleted: boolean; seq: number })[] = [];
  readonly deviceRows: Device[] = [];
  readonly dsrRows: { id: string; userId: string; type: 'DELETION'; open: boolean; dueAt: Date }[] =
    [];
  readonly auditRows: AuditRow[] = [];
  readonly revokedSessionUsers: string[] = [];
  readonly fileRows = new Map<string, FileRow>();
  readonly operatorRows = new Map<string, OperatorRow>();
  readonly kybDocRows: KybDocumentRow[] = [];
  readonly payoutRows = new Map<string, PayoutAccountRow>();
  readonly settingRows = new Map<string, unknown>([
    ['legal.terms_version', '2026-10-01'],
    ['legal.privacy_version', '2026-10-01'],
    ['legal.operator_agreement_version', '2026-10-01'],
    ['fees.commission_bps_default', 1200],
  ]);
  private seq = 0;

  /** Test helper: what the on_auth_user_created trigger does. */
  seedUser(
    id: string,
    opts: { roles?: RoleGrant[]; firstName?: string; phoneLast4?: string } = {},
  ) {
    this.userRows.set(id, {
      id,
      firstName: opts.firstName ?? null,
      lastName: null,
      phoneLast4: opts.phoneLast4 ?? null,
      status: 'ACTIVE',
      marketingOptIn: false,
    });
    for (const g of opts.roles ?? []) this.roleRows.push({ ...g, userId: id });
  }

  users: Store['users'] = {
    find: async (id) => this.copy(this.userRows.get(id)),
    ensure: async (id, init) => {
      const existing = this.userRows.get(id);
      if (existing) return { user: { ...existing }, created: false };
      // Mirrors fn_on_auth_user_created: only phone sign-ups become drivers.
      this.seedUser(id, {
        roles: init.phoneLast4 ? [{ role: 'DRIVER', operatorId: null }] : [],
        ...(init.phoneLast4 ? { phoneLast4: init.phoneLast4 } : {}),
      });
      return { user: { ...this.mustUser(id) }, created: true };
    },
    setLookupHashes: async (id, hashes) => {
      const u = this.userRows.get(id);
      if (u) Object.assign(u, hashes);
    },
    updateProfile: async (id, patch) => {
      const u = this.userRows.get(id);
      if (!u) throw new Error('no user');
      Object.assign(u, patch);
      return { ...u };
    },
    setStatus: async (id, status) => {
      const u = this.userRows.get(id);
      if (u) u.status = status;
    },
    setMarketingOptIn: async (id, value) => {
      const u = this.userRows.get(id);
      if (u) u.marketingOptIn = value;
    },
    roles: async (id) =>
      this.roleRows
        .filter((r) => r.userId === id)
        .map(({ role, operatorId }) => ({ role, operatorId })),
  };

  consents: Store['consents'] = {
    add: async (e) => {
      this.consentRows.push({ ...e, at: ++this.seq });
    },
    latest: async (userId) => {
      const out: Partial<Record<ConsentType, { version: string; granted: boolean }>> = {};
      for (const c of this.consentRows
        .filter((r) => r.userId === userId)
        .sort((a, b) => a.at - b.at)) {
        out[c.type] = { version: c.version, granted: c.granted };
      }
      return out;
    },
  };

  vehicles: Store['vehicles'] = {
    list: async (userId) =>
      this.vehicleRows
        .filter((v) => v.userId === userId && !v.deleted)
        .sort((a, b) => a.seq - b.seq)
        .map(strip),
    find: async (userId, id) => {
      const v = this.vehicleRows.find((r) => r.id === id && r.userId === userId && !r.deleted);
      return v ? strip(v) : null;
    },
    create: async (row) => {
      if (
        this.vehicleRows.some(
          (v) => v.userId === row.userId && v.plateNorm === row.plateNorm && !v.deleted,
        )
      ) {
        throw new DuplicatePlateError();
      }
      if (row.isDefault) this.clearDefault(row.userId);
      const v = { ...row, id: randomUUID(), deleted: false, seq: ++this.seq };
      this.vehicleRows.push(v);
      return strip(v);
    },
    update: async (userId, id, patch) => {
      const v = this.vehicleRows.find((r) => r.id === id && r.userId === userId && !r.deleted);
      if (!v) throw new Error('no vehicle');
      Object.assign(v, patch);
      return strip(v);
    },
    setDefault: async (userId, id) => {
      this.clearDefault(userId);
      const v = this.vehicleRows.find((r) => r.id === id && r.userId === userId && !r.deleted);
      if (v) v.isDefault = true;
    },
    remove: async (userId, id) => {
      const v = this.vehicleRows.find((r) => r.id === id && r.userId === userId && !r.deleted);
      if (!v) return;
      v.deleted = true;
      if (v.isDefault) {
        v.isDefault = false;
        const next = this.vehicleRows
          .filter((r) => r.userId === userId && !r.deleted)
          .sort((a, b) => a.seq - b.seq)[0];
        if (next) next.isDefault = true;
      }
    },
  };

  devices: Store['devices'] = {
    upsert: async (row) => {
      const existing = this.deviceRows.find(
        (d) => d.userId === row.userId && d.clientDeviceId === row.clientDeviceId,
      );
      if (existing) Object.assign(existing, row, { revokedAt: null });
      else this.deviceRows.push({ ...row, revokedAt: null });
    },
    revokeBySession: async (userId, sessionId) => {
      for (const d of this.deviceRows)
        if (d.userId === userId && d.authSessionId === sessionId) d.revokedAt = new Date();
    },
    revokeAll: async (userId) => {
      for (const d of this.deviceRows) if (d.userId === userId) d.revokedAt = new Date();
    },
  };

  sessions: Store['sessions'] = {
    revokeAll: async (userId) => {
      this.revokedSessionUsers.push(userId);
    },
  };

  dataRequests: Store['dataRequests'] = {
    createDeletion: async (userId, dueAt) => {
      if (this.dsrRows.some((r) => r.userId === userId && r.open)) throw new DsrAlreadyOpenError();
      const row = { id: randomUUID(), userId, type: 'DELETION' as const, open: true, dueAt };
      this.dsrRows.push(row);
      return { id: row.id };
    },
  };

  files: Store['files'] = {
    create: async (row) => {
      const file: FileRow = { ...row, status: 'PENDING', rejectionReason: null, verifiedAt: null };
      this.fileRows.set(row.id, file);
      return { ...file };
    },
    find: async (id) => this.copy(this.fileRows.get(id)),
    markVerified: async (id, stored, at) => {
      Object.assign(this.mustFile(id), { ...stored, status: 'VERIFIED', verifiedAt: at });
    },
    markRejected: async (id, reason) => {
      Object.assign(this.mustFile(id), { status: 'REJECTED', rejectionReason: reason });
    },
  };

  kybDocuments: Store['kybDocuments'] = {
    create: async (row) => {
      const doc: KybDocumentRow = {
        ...row,
        id: randomUUID(),
        status: 'SUBMITTED',
        rejectionReason: null,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.kybDocRows.push(doc);
      return { ...doc };
    },
    list: async (operatorId) =>
      this.kybDocRows
        .filter((d) => d.operatorId === operatorId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((d) => {
          const f = this.mustFile(d.fileId);
          return { ...d, mime: f.mime, sizeBytes: f.sizeBytes, fileStatus: f.status };
        }),
    find: async (operatorId, id) =>
      this.copy(this.kybDocRows.find((d) => d.operatorId === operatorId && d.id === id)),
    remove: async (operatorId, id) => {
      const i = this.kybDocRows.findIndex((d) => d.operatorId === operatorId && d.id === id);
      if (i < 0) return;
      const [doc] = this.kybDocRows.splice(i, 1);
      if (doc)
        Object.assign(this.mustFile(doc.fileId), {
          status: 'REJECTED',
          rejectionReason: 'DELETED',
        });
    },
  };

  payoutAccounts: Store['payoutAccounts'] = {
    upsert: async (row) => {
      const account: PayoutAccountRow = {
        ...row,
        status: 'VERIFIED',
        providerSubaccountCode: null,
      };
      this.payoutRows.set(row.operatorId, account);
      return { ...account };
    },
    find: async (operatorId) => this.copy(this.payoutRows.get(operatorId)),
  };

  audit: Store['audit'] = {
    write: async (entry) => {
      // Strictly increasing timestamps keep cursor tests deterministic.
      this.auditRows.push({
        ...entry,
        id: randomUUID(),
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      });
    },
    list: async (q) =>
      this.auditRows
        .filter(
          (r) =>
            (!q.entityType || r.entityType === q.entityType) &&
            (!q.entityId || r.entityId === q.entityId) &&
            (!q.actorUserId || r.actorUserId === q.actorUserId) &&
            (!q.before || r.createdAt.getTime() < q.before.createdAt.getTime()),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, q.limit),
  };

  operators: Store['operators'] = {
    create: async ({ ownerUserId, commissionBps, ...details }) => {
      if (await this.operators.ownedBy(ownerUserId)) throw new OperatorExistsError();
      const row: OperatorRow = {
        ...details,
        id: randomUUID(),
        status: 'ONBOARDING',
        kybStatus: 'NOT_STARTED',
        commissionBps,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.operatorRows.set(row.id, row);
      this.roleRows.push({ userId: ownerUserId, role: 'OPERATOR_OWNER', operatorId: row.id });
      return { ...row };
    },
    find: async (id) => this.copy(this.operatorRows.get(id)),
    update: async (id, patch) => {
      const row = this.operatorRows.get(id);
      if (!row) throw new Error(`no operator ${id}`);
      Object.assign(row, patch);
      return { ...row };
    },
    submitKyb: async (id) => {
      const row = this.operatorRows.get(id);
      if (!row) throw new Error(`no operator ${id}`);
      row.kybStatus = 'SUBMITTED';
      return { ...row };
    },
    ownedBy: async (userId) =>
      this.roleRows.find((r) => r.userId === userId && r.role === 'OPERATOR_OWNER')?.operatorId ??
      null,
    members: async (operatorId) =>
      this.roleRows
        .filter((r) => r.operatorId === operatorId)
        .map((r) => ({
          userId: r.userId,
          role: r.role,
          firstName: this.userRows.get(r.userId)?.firstName ?? null,
        })),
  };

  settings: Store['settings'] = {
    get: async <T>(key: string) => this.settingRows.get(key) as T | undefined,
  };

  private mustFile(id: string) {
    const f = this.fileRows.get(id);
    if (!f) throw new Error(`no file ${id}`);
    return f;
  }

  private mustUser(id: string) {
    const u = this.userRows.get(id);
    if (!u) throw new Error(`no user ${id}`);
    return u;
  }

  private clearDefault(userId: string) {
    for (const v of this.vehicleRows) if (v.userId === userId) v.isDefault = false;
  }

  private copy<T extends object>(row: T | undefined): T | null {
    return row ? { ...row } : null;
  }
}

function strip(v: VehicleRow & { deleted: boolean; seq: number }): VehicleRow {
  const { deleted: _d, seq: _s, ...rest } = v;
  return rest;
}
