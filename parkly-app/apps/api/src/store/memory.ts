import type { RoleGrant } from '@parkly/domain/authz';
import { randomUUID } from 'node:crypto';
import {
  DsrAlreadyOpenError,
  DuplicatePlateError,
  MemberExistsError,
  OperatorExistsError,
  SlugTakenError,
  StaleVersionError,
  type AuditRow,
  type FileRow,
  type KybDocumentRow,
  type LotPhotoRow,
  type LiveLotRow,
  type LotRow,
  type MemberRow,
  type OpeningHourRow,
  type PermitRow,
  type RatePlanRow,
  type SlotRow,
  type PayoutAccountRow,
  type OperatorRow,
  type ConsentType,
  type Store,
  type UserRow,
  type VehicleRow,
  type VerificationRow,
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
  readonly lotRows = new Map<string, LotRow>();
  readonly hourRows = new Map<string, OpeningHourRow[]>();
  readonly photoRows: LotPhotoRow[] = [];
  readonly permitRows: PermitRow[] = [];
  readonly ratePlanRows: (RatePlanRow & { effectiveFrom?: Date })[] = [];
  readonly verificationRows: VerificationRow[] = [];
  readonly flagRows = new Map<string, boolean>();
  readonly slotRows: SlotRow[] = [];
  readonly memberRows: (MemberRow & {
    inviteePhoneHash: Buffer | null;
    inviteeEmailHash: Buffer | null;
    inviteTokenHash: Buffer | null;
  })[] = [];
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
    setSubaccount: async (operatorId, code) => {
      const p = this.payoutRows.get(operatorId);
      if (p) p.providerSubaccountCode = code;
    },
  };

  lots: Store['lots'] = {
    create: async ({ createdBy: _createdBy, ...row }) => {
      if ([...this.lotRows.values()].some((l) => l.slug === row.slug)) throw new SlugTakenError();
      const lot: LotRow = {
        ...row,
        location: { ...row.location },
        id: randomUUID(),
        status: 'DRAFT',
        statusReason: null,
        version: 1,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.lotRows.set(lot.id, lot);
      return { ...lot };
    },
    find: async (operatorId, id) => {
      const lot = this.lotRows.get(id);
      return lot && lot.operatorId === operatorId ? { ...lot } : null;
    },
    findById: async (id) => this.copy(this.lotRows.get(id)),
    listByStatus: async (status) =>
      [...this.lotRows.values()]
        .filter((l) => l.status === status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((l) => ({
          ...l,
          photoCount: this.photoRows.filter((p) => p.lotId === l.id).length,
          operatorName: this.operatorRows.get(l.operatorId)?.legalName ?? '',
          pendingPriceCount: this.ratePlanRows.filter(
            (p) => p.lotId === l.id && p.status === 'PENDING_APPROVAL',
          ).length,
        })),
    list: async (operatorId) =>
      [...this.lotRows.values()]
        .filter((l) => l.operatorId === operatorId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((l) => ({ ...l, photoCount: this.photoRows.filter((p) => p.lotId === l.id).length })),
    update: async (operatorId, id, version, patch) => {
      const lot = this.lotRows.get(id);
      if (!lot || lot.operatorId !== operatorId) throw new Error(`no lot ${id}`);
      if (lot.version !== version) throw new StaleVersionError();
      Object.assign(lot, patch, { version: lot.version + 1 });
      return { ...lot };
    },
    setStatus: async (operatorId, id, from, to, reason) => {
      const lot = this.lotRows.get(id);
      if (!lot || lot.operatorId !== operatorId || lot.status !== from)
        throw new StaleVersionError();
      Object.assign(lot, { status: to, statusReason: reason, version: lot.version + 1 });
      return { ...lot };
    },
    openingHoursFor: async (lotIds) =>
      lotIds.flatMap((lotId) => (this.hourRows.get(lotId) ?? []).map((h) => ({ ...h, lotId }))),
    searchLive: async ({ lat, lng, radiusM, today, limit }) =>
      [...this.lotRows.values()]
        .map((l) => ({ lot: this.live(l, today), distanceM: haversineM(l.location, { lat, lng }) }))
        .filter(
          (r): r is { lot: LiveLotRow; distanceM: number } => !!r.lot && r.distanceM <= radiusM,
        )
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, limit)
        .map(({ lot, distanceM }) => ({ ...lot, distanceM: Math.round(distanceM) })),
    findLive: async (idOrSlug, today) => {
      const lot = [...this.lotRows.values()].find((l) => l.id === idOrSlug || l.slug === idOrSlug);
      return lot ? this.live(lot, today) : null;
    },
    openingHours: async (lotId) =>
      [...(this.hourRows.get(lotId) ?? [])].sort((a, b) => a.weekday - b.weekday),
    setOpeningHours: async (lotId, days) => {
      this.hourRows.set(
        lotId,
        days.map((d) => ({ ...d })),
      );
    },
  };

  permits: Store['permits'] = {
    create: async ({ submittedBy: _by, ...row }) => {
      const permit: PermitRow = {
        ...row,
        id: randomUUID(),
        issuer: 'LASPA',
        status: 'SUBMITTED',
        rejectionReason: null,
        reviewNote: null,
        lastReminderDays: null,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.permitRows.push(permit);
      return { ...permit };
    },
    latest: async (lotId) =>
      this.copy(
        this.permitRows
          .filter((p) => p.lotId === lotId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0],
      ),
    find: async (id) => this.copy(this.permitRows.find((p) => p.id === id)),
    currentApproved: async (lotId, today) =>
      this.copy(
        this.permitRows
          .filter((p) => p.lotId === lotId && p.status === 'APPROVED' && p.expiresAt > today)
          .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0],
      ),
    approve: async (id, { note }) =>
      this.decide(this.permitRows, id, { status: 'APPROVED', reviewNote: note }),
    reject: async (id, { reason }) =>
      this.decide(this.permitRows, id, { status: 'REJECTED', rejectionReason: reason }),
    dueForExpiryCheck: async (today, limit) =>
      this.permitRows
        .filter((p) => {
          if (p.status !== 'APPROVED') return false;
          const daysLeft = Math.round(
            (Date.parse(`${p.expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5,
          );
          if (daysLeft <= 0) return true;
          if (daysLeft > 30) return false;
          const bucket = daysLeft <= 1 ? 1 : daysLeft <= 7 ? 7 : daysLeft <= 14 ? 14 : 30;
          return p.lastReminderDays === null || p.lastReminderDays > bucket;
        })
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((p) => ({ ...p })),
    markReminded: async (id, days) => {
      const p = this.permitRows.find((r) => r.id === id);
      if (p && (p.lastReminderDays === null || p.lastReminderDays > days))
        p.lastReminderDays = days;
    },
    expire: async (id) => {
      const p = this.permitRows.find((r) => r.id === id);
      if (p?.status !== 'APPROVED') return false;
      p.status = 'EXPIRED';
      return true;
    },
  };

  ratePlans: Store['ratePlans'] = {
    submit: async ({ submittedBy: _by, ...row }) => {
      const pending = this.ratePlanRows.find(
        (p) =>
          p.lotId === row.lotId && p.product === row.product && p.status === 'PENDING_APPROVAL',
      );
      if (pending) {
        Object.assign(pending, row);
        return { ...pending };
      }
      const plan: RatePlanRow = {
        ...row,
        id: randomUUID(),
        status: 'PENDING_APPROVAL',
        rejectionReason: null,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.ratePlanRows.push(plan);
      return { ...plan };
    },
    current: async (lotId) => {
      const order = ['HOURLY', 'DAILY', 'MONTHLY'];
      return this.ratePlanRows
        .filter(
          (p) => p.lotId === lotId && (p.status === 'ACTIVE' || p.status === 'PENDING_APPROVAL'),
        )
        .sort(
          (a, b) =>
            order.indexOf(a.product) - order.indexOf(b.product) ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .map(({ effectiveFrom: _e, ...p }) => p);
    },
    latestRejected: async (lotId) => {
      const newest = new Map<string, RatePlanRow & { effectiveFrom?: Date }>();
      for (const p of this.ratePlanRows)
        if (p.lotId === lotId && p.status === 'REJECTED') {
          const seen = newest.get(p.product);
          if (!seen || p.createdAt.getTime() > seen.createdAt.getTime()) newest.set(p.product, p);
        }
      return [...newest.values()].map(({ effectiveFrom: _e, ...p }) => p);
    },
    activeFor: async (lotIds) =>
      this.ratePlanRows
        .filter((p) => lotIds.includes(p.lotId) && p.status === 'ACTIVE')
        .map(({ effectiveFrom: _e, ...p }) => p),
    find: async (id) => {
      const plan = this.ratePlanRows.find((p) => p.id === id);
      if (!plan) return null;
      const { effectiveFrom: _e, ...row } = plan;
      return row;
    },
    approve: async (id, { at }) => {
      const plan = this.ratePlanRows.find((p) => p.id === id);
      if (plan?.status !== 'PENDING_APPROVAL') throw new StaleVersionError();
      for (const p of this.ratePlanRows)
        if (p.lotId === plan.lotId && p.product === plan.product && p.status === 'ACTIVE')
          p.status = 'RETIRED';
      Object.assign(plan, { status: 'ACTIVE', effectiveFrom: at });
      const { effectiveFrom: _e, ...row } = plan;
      return row;
    },
    reject: async (id, { reason }) => {
      const plan = this.ratePlanRows.find((p) => p.id === id);
      if (plan?.status !== 'PENDING_APPROVAL') throw new StaleVersionError();
      Object.assign(plan, { status: 'REJECTED', rejectionReason: reason });
      const { effectiveFrom: _e, ...row } = plan;
      return row;
    },
  };

  lotPhotos: Store['lotPhotos'] = {
    create: async (row) => {
      const photo: LotPhotoRow = {
        ...row,
        id: randomUUID(),
        publicFileId: null,
        status: 'PENDING',
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.photoRows.push(photo);
      return { ...photo };
    },
    list: async (lotId) =>
      this.photoRows
        .filter((p) => p.lotId === lotId)
        .sort((a, b) => a.sort - b.sort || a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({ ...p, sizeBytes: this.mustFile(p.fileId).sizeBytes })),
    find: async (lotId, id) =>
      this.copy(this.photoRows.find((p) => p.lotId === lotId && p.id === id)),
    findById: async (id) => this.copy(this.photoRows.find((p) => p.id === id)),
    publicFor: async (lotIds) =>
      this.photoRows
        .filter((p) => lotIds.includes(p.lotId) && p.status === 'APPROVED' && p.publicFileId)
        .sort((a, b) => a.sort - b.sort || a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({
          lotId: p.lotId,
          path: this.mustFile(p.publicFileId as string).path,
          sort: p.sort,
        })),
    review: async (id, decision) => {
      const photo = this.photoRows.find((p) => p.id === id);
      if (photo?.status !== 'PENDING') throw new StaleVersionError();
      Object.assign(photo, decision);
      return { ...photo };
    },
    remove: async (lotId, id) => {
      const i = this.photoRows.findIndex((p) => p.lotId === lotId && p.id === id);
      if (i < 0) return;
      const [photo] = this.photoRows.splice(i, 1);
      if (photo)
        Object.assign(this.mustFile(photo.fileId), {
          status: 'REJECTED',
          rejectionReason: 'DELETED',
        });
    },
  };

  verifications: Store['verifications'] = {
    create: async (row) => {
      const record: VerificationRow = {
        ...row,
        items: row.items.map((i) => ({ ...i })),
        id: randomUUID(),
        status: 'SUBMITTED',
        rejectionReason: null,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.verificationRows.push(record);
      return this.copyVerification(record);
    },
    latest: async (lotId) => {
      const record = this.verificationRows
        .filter((v) => v.lotId === lotId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return record ? this.copyVerification(record) : null;
    },
    find: async (id) => {
      const record = this.verificationRows.find((v) => v.id === id);
      return record ? this.copyVerification(record) : null;
    },
    currentApproved: async (lotId, today) => {
      const record = this.verificationRows
        .filter((v) => v.lotId === lotId && v.status === 'APPROVED' && v.validUntil > today)
        .sort((a, b) => b.inspectedAt.getTime() - a.inspectedAt.getTime())[0];
      return record ? this.copyVerification(record) : null;
    },
    approve: async (id) => {
      const record = this.verificationRows.find((v) => v.id === id);
      if (!record || (record.status !== 'SUBMITTED' && record.status !== 'IN_REVIEW'))
        throw new StaleVersionError();
      record.status = 'APPROVED';
      const lot = this.lotRows.get(record.lotId);
      if (lot && record.capacityCounted < lot.capacityTotal)
        Object.assign(lot, {
          capacityTotal: record.capacityCounted,
          capacityBookable: Math.min(lot.capacityBookable, record.capacityCounted),
          version: lot.version + 1,
        });
      return this.copyVerification(record);
    },
    reject: async (id, { reason }) => {
      const record = this.verificationRows.find((v) => v.id === id);
      if (!record || (record.status !== 'SUBMITTED' && record.status !== 'IN_REVIEW'))
        throw new StaleVersionError();
      Object.assign(record, { status: 'REJECTED', rejectionReason: reason });
      return this.copyVerification(record);
    },
  };

  members: Store['members'] = {
    list: async (operatorId) =>
      this.memberRows
        .filter((m) => m.operatorId === operatorId && m.status !== 'REMOVED')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((m) => {
          const u = m.userId ? this.userRows.get(m.userId) : undefined;
          return {
            ...this.member(m),
            firstName: u?.firstName ?? null,
            lastName: u?.lastName ?? null,
          };
        }),
    find: async (operatorId, id) => {
      const m = this.memberRows.find((r) => r.operatorId === operatorId && r.id === id);
      return m ? this.member(m) : null;
    },
    findByContact: async (operatorId, { phoneHash, emailHash }, now) => {
      const same = (a: Buffer | null | undefined, b: Buffer | null) => !!a && !!b && a.equals(b);
      const m = this.memberRows.find((r) => {
        if (r.operatorId !== operatorId) return false;
        if (r.status === 'ACTIVE' && r.userId) {
          const u = this.userRows.get(r.userId);
          return same(u?.phoneHash, phoneHash) || same(u?.emailHash, emailHash);
        }
        return (
          r.status === 'INVITED' &&
          (r.inviteExpiresAt?.getTime() ?? 0) > now.getTime() &&
          (same(r.inviteePhoneHash, phoneHash) || same(r.inviteeEmailHash, emailHash))
        );
      });
      return m ? this.member(m) : null;
    },
    invite: async (row) => {
      const m = {
        ...row,
        lotIds: [...row.lotIds],
        id: randomUUID(),
        userId: null,
        status: 'INVITED' as const,
        acceptedAt: null,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.memberRows.push(m);
      return this.member(m);
    },
    findByToken: async (tokenHash) => {
      const m = this.memberRows.find((r) => r.inviteTokenHash?.equals(tokenHash));
      return m
        ? {
            ...this.member(m),
            inviteePhoneHash: m.inviteePhoneHash,
            inviteeEmailHash: m.inviteeEmailHash,
          }
        : null;
    },
    accept: async (id, userId, at) => {
      const m = this.memberRows.find((r) => r.id === id);
      if (m?.status !== 'INVITED') throw new StaleVersionError();
      if (
        this.memberRows.some(
          (r) => r.operatorId === m.operatorId && r.userId === userId && r.status !== 'REMOVED',
        )
      )
        throw new MemberExistsError();
      Object.assign(m, { status: 'ACTIVE', userId, acceptedAt: at, inviteTokenHash: null });
      const role = m.role === 'MANAGER' ? 'OPERATOR_MANAGER' : 'OPERATOR_ATTENDANT';
      if (
        !this.roleRows.some(
          (r) => r.userId === userId && r.role === role && r.operatorId === m.operatorId,
        )
      )
        this.roleRows.push({ userId, role, operatorId: m.operatorId });
      return this.member(m);
    },
    remove: async (operatorId, id) => {
      const m = this.memberRows.find((r) => r.operatorId === operatorId && r.id === id);
      if (!m || m.status === 'REMOVED') throw new StaleVersionError();
      const wasActive = m.status === 'ACTIVE';
      Object.assign(m, { status: 'REMOVED', inviteTokenHash: null });
      if (wasActive && m.userId) {
        const role =
          m.role === 'OWNER'
            ? 'OPERATOR_OWNER'
            : m.role === 'MANAGER'
              ? 'OPERATOR_MANAGER'
              : 'OPERATOR_ATTENDANT';
        const i = this.roleRows.findIndex(
          (r) => r.userId === m.userId && r.role === role && r.operatorId === operatorId,
        );
        if (i >= 0) this.roleRows.splice(i, 1);
      }
      return this.member(m);
    },
    attendantLotIds: async (userId) =>
      this.memberRows
        .filter((m) => m.userId === userId && m.role === 'ATTENDANT' && m.status === 'ACTIVE')
        .flatMap((m) =>
          m.lotIds.length > 0
            ? m.lotIds
            : [...this.lotRows.values()]
                .filter((l) => l.operatorId === m.operatorId)
                .map((l) => l.id),
        ),
  };

  inventory: Store['inventory'] = {
    slots: async (lotIds, from, to) =>
      this.slotRows
        .filter(
          (r) =>
            lotIds.includes(r.lotId) &&
            r.slotStart.getTime() >= from.getTime() &&
            r.slotStart.getTime() < to.getTime(),
        )
        .map((r) => ({ ...r })),
  };

  flags: Store['flags'] = {
    enabled: async (key) => this.flagRows.get(key) ?? false,
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
        kybSubmittedAt: null,
        kybRejectionReason: null,
        commissionBps,
        createdAt: new Date(Date.UTC(2026, 9, 15) + ++this.seq),
      };
      this.operatorRows.set(row.id, row);
      this.roleRows.push({ userId: ownerUserId, role: 'OPERATOR_OWNER', operatorId: row.id });
      this.memberRows.push({
        id: randomUUID(),
        operatorId: row.id,
        userId: ownerUserId,
        role: 'OWNER',
        lotIds: [],
        status: 'ACTIVE',
        inviteeName: null,
        inviteExpiresAt: null,
        invitedBy: null,
        acceptedAt: row.createdAt,
        createdAt: row.createdAt,
        inviteePhoneHash: null,
        inviteeEmailHash: null,
        inviteTokenHash: null,
      });
      return { ...row };
    },
    find: async (id) => this.copy(this.operatorRows.get(id)),
    update: async (id, patch) => {
      const row = this.operatorRows.get(id);
      if (!row) throw new Error(`no operator ${id}`);
      Object.assign(row, patch);
      return { ...row };
    },
    submitKyb: async (id, at) => {
      const row = this.operatorRows.get(id);
      if (!row) throw new Error(`no operator ${id}`);
      row.kybStatus = 'SUBMITTED';
      row.kybSubmittedAt = at;
      row.kybRejectionReason = null;
      return { ...row };
    },
    list: async ({ kybStatus }) =>
      [...this.operatorRows.values()]
        .filter((o) => !kybStatus || o.kybStatus === kybStatus)
        .sort(
          (a, b) =>
            (a.kybSubmittedAt?.getTime() ?? Infinity) - (b.kybSubmittedAt?.getTime() ?? Infinity) ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .map((o) => ({ ...o })),
    approveKyb: async (id) => {
      const row = this.operatorRows.get(id);
      const payout = this.payoutRows.get(id);
      if (!row || row.kybStatus !== 'SUBMITTED') throw new StaleVersionError();
      if (!payout?.providerSubaccountCode) throw new Error('subaccount code not saved');
      Object.assign(row, { kybStatus: 'APPROVED', status: 'ACTIVE', kybRejectionReason: null });
      for (const d of this.kybDocRows) if (d.operatorId === id) d.status = 'APPROVED';
      Object.assign(payout, { status: 'ACTIVE', pendingAccountNumberEnc: null });
      return { ...row };
    },
    rejectKyb: async (id, { reason }) => {
      const row = this.operatorRows.get(id);
      if (!row || row.kybStatus !== 'SUBMITTED') throw new StaleVersionError();
      Object.assign(row, { kybStatus: 'REJECTED', kybRejectionReason: reason });
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

  /** The listing gate, as the SQL in DrizzleStore applies it. */
  private live(l: LotRow, today: string): LiveLotRow | null {
    const op = this.operatorRows.get(l.operatorId);
    const listable =
      l.status === 'LIVE' &&
      op?.status === 'ACTIVE' &&
      op.kybStatus === 'APPROVED' &&
      this.permitRows.some(
        (p) => p.lotId === l.id && p.status === 'APPROVED' && p.expiresAt > today,
      ) &&
      this.verificationRows.some(
        (v) => v.lotId === l.id && v.status === 'APPROVED' && v.validUntil > today,
      );
    return listable && op
      ? {
          ...l,
          location: { ...l.location },
          operatorName: op.tradingName,
          commissionBps: op.commissionBps,
        }
      : null;
  }

  private member(m: MemberRow): MemberRow {
    return {
      id: m.id,
      operatorId: m.operatorId,
      userId: m.userId,
      role: m.role,
      lotIds: [...m.lotIds],
      status: m.status,
      inviteeName: m.inviteeName,
      inviteExpiresAt: m.inviteExpiresAt,
      invitedBy: m.invitedBy,
      acceptedAt: m.acceptedAt,
      createdAt: m.createdAt,
    };
  }

  private copyVerification(v: VerificationRow): VerificationRow {
    return { ...v, gps: v.gps && { ...v.gps }, items: v.items.map((i) => ({ ...i })) };
  }

  /** Review from SUBMITTED / IN_REVIEW only, like the conditional UPDATE in Postgres. */
  private decide<T extends { id: string; status: string }>(
    rows: T[],
    id: string,
    patch: Partial<T>,
  ): T {
    const row = rows.find((r) => r.id === id);
    if (!row || (row.status !== 'SUBMITTED' && row.status !== 'IN_REVIEW'))
      throw new StaleVersionError();
    Object.assign(row, patch);
    return { ...row };
  }
}

/** Great-circle distance in metres; PostGIS geography distance in DrizzleStore. */
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

function strip(v: VehicleRow & { deleted: boolean; seq: number }): VehicleRow {
  const { deleted: _d, seq: _s, ...rest } = v;
  return rest;
}
