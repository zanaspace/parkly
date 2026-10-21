import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import type { RoleGrant } from '@parkly/domain/authz';
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  DsrAlreadyOpenError,
  DuplicatePlateError,
  MemberExistsError,
  OperatorExistsError,
  SlugTakenError,
  StaleVersionError,
  type ConsentType,
  type FileRow,
  type KybDocumentRow,
  type LotPhotoRow,
  type LotRow,
  type MemberRow,
  type OpeningHourRow,
  type PermitRow,
  type RatePlanRow,
  type PayoutAccountRow,
  type OperatorRow,
  type Store,
  type UserRow,
  type VehicleRow,
  type VerificationRow,
} from './types.js';

const {
  users,
  userRoles,
  consents,
  vehicles,
  devices,
  dataSubjectRequests,
  auditLogs,
  platformSettings,
  files,
  operators,
  operatorMembers,
  operatorKybDocuments,
  payoutAccounts,
  lots,
  lotOpeningHours,
  lotPhotos,
  permits,
  ratePlans,
  verificationRecords,
  verificationItems,
  featureFlags,
} = schema;

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as {
    code?: string;
    constraint_name?: string;
    cause?: { code?: string; constraint_name?: string };
  };
  const pg = e.code ? e : e.cause;
  return pg?.code === UNIQUE_VIOLATION && pg.constraint_name === constraint;
}

const userColumns = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  phoneLast4: users.phoneLast4,
  status: users.status,
  marketingOptIn: users.marketingOptIn,
};

const vehicleColumns = {
  id: vehicles.id,
  userId: vehicles.userId,
  plateRaw: vehicles.plateRaw,
  plateNorm: vehicles.plateNorm,
  make: vehicles.make,
  model: vehicles.model,
  colour: vehicles.colour,
  isDefault: vehicles.isDefault,
};

const fileColumns = {
  id: files.id,
  bucket: files.bucket,
  path: files.path,
  dataClass: files.dataClass,
  retentionPolicy: files.retentionPolicy,
  ownerEntityType: files.ownerEntityType,
  ownerEntityId: files.ownerEntityId,
  uploadedBy: files.uploadedBy,
  status: files.status,
  mime: files.mime,
  sizeBytes: files.sizeBytes,
  sha256: files.sha256,
  rejectionReason: files.rejectionReason,
  verifiedAt: files.verifiedAt,
  createdAt: files.createdAt,
};

const operatorColumns = {
  id: operators.id,
  legalName: operators.legalName,
  tradingName: operators.tradingName,
  type: operators.type,
  cacNumberEnc: operators.cacNumberEnc,
  tinEnc: operators.tinEnc,
  addressLine: operators.addressLine,
  contactEmail: operators.contactEmail,
  contactPhoneEnc: operators.contactPhoneEnc,
  status: operators.status,
  kybStatus: operators.kybStatus,
  kybSubmittedAt: operators.kybSubmittedAt,
  kybRejectionReason: operators.kybRejectionReason,
  commissionBps: operators.commissionBps,
  createdAt: operators.createdAt,
};

const kybDocumentColumns = {
  id: operatorKybDocuments.id,
  operatorId: operatorKybDocuments.operatorId,
  type: operatorKybDocuments.type,
  fileId: operatorKybDocuments.fileId,
  status: operatorKybDocuments.status,
  rejectionReason: operatorKybDocuments.rejectionReason,
  createdAt: operatorKybDocuments.createdAt,
};

const payoutColumns = {
  operatorId: payoutAccounts.operatorId,
  bankCode: payoutAccounts.bankCode,
  bankName: payoutAccounts.bankName,
  accountNumberLast4: payoutAccounts.accountNumberLast4,
  accountName: payoutAccounts.accountName,
  pendingAccountNumberEnc: payoutAccounts.pendingAccountNumberEnc,
  nameMismatch: payoutAccounts.nameMismatch,
  providerSubaccountCode: payoutAccounts.providerSubaccountCode,
  status: payoutAccounts.status,
  verifiedAt: payoutAccounts.verifiedAt,
};

const lotColumns = {
  id: lots.id,
  operatorId: lots.operatorId,
  type: lots.type,
  name: lots.name,
  slug: lots.slug,
  description: lots.description,
  addressLine: lots.addressLine,
  area: lots.area,
  lga: lots.lga,
  location: lots.location,
  entranceNotes: lots.entranceNotes,
  capacityTotal: lots.capacityTotal,
  capacityBookable: lots.capacityBookable,
  amenities: lots.amenities,
  vehicleTypes: lots.vehicleTypes,
  status: lots.status,
  statusReason: lots.statusReason,
  version: lots.version,
  createdAt: lots.createdAt,
};

const photoColumns = {
  id: lotPhotos.id,
  lotId: lotPhotos.lotId,
  fileId: lotPhotos.fileId,
  publicFileId: lotPhotos.publicFileId,
  sort: lotPhotos.sort,
  status: lotPhotos.status,
  createdAt: lotPhotos.createdAt,
};

const permitColumns = {
  id: permits.id,
  lotId: permits.lotId,
  issuer: permits.issuer,
  permitNumber: permits.permitNumber,
  issuedAt: permits.issuedAt,
  expiresAt: permits.expiresAt,
  documentFileId: permits.documentFileId,
  status: permits.status,
  rejectionReason: permits.rejectionReason,
  reviewNote: permits.reviewNote,
  lastReminderDays: permits.lastReminderDays,
  createdAt: permits.createdAt,
};

const ratePlanColumns = {
  id: ratePlans.id,
  lotId: ratePlans.lotId,
  product: ratePlans.product,
  status: ratePlans.status,
  hourlyRateKobo: ratePlans.hourlyRateKobo,
  minMinutes: ratePlans.minMinutes,
  dailyCapKobo: ratePlans.dailyCapKobo,
  dailyRateKobo: ratePlans.dailyRateKobo,
  monthlyRateKobo: ratePlans.monthlyRateKobo,
  rejectionReason: ratePlans.rejectionReason,
  createdAt: ratePlans.createdAt,
};

const memberColumns = {
  id: operatorMembers.id,
  operatorId: operatorMembers.operatorId,
  userId: operatorMembers.userId,
  role: operatorMembers.role,
  lotIds: operatorMembers.lotIds,
  status: operatorMembers.status,
  inviteeName: operatorMembers.inviteeName,
  inviteExpiresAt: operatorMembers.inviteExpiresAt,
  invitedBy: operatorMembers.invitedBy,
  acceptedAt: operatorMembers.acceptedAt,
  createdAt: operatorMembers.createdAt,
};

const MEMBER_ROLE = {
  OWNER: 'OPERATOR_OWNER',
  MANAGER: 'OPERATOR_MANAGER',
  ATTENDANT: 'OPERATOR_ATTENDANT',
} as const;

const verificationColumns = {
  id: verificationRecords.id,
  lotId: verificationRecords.lotId,
  inspectorUserId: verificationRecords.inspectorUserId,
  inspectedAt: verificationRecords.inspectedAt,
  status: verificationRecords.status,
  capacityCounted: verificationRecords.capacityCounted,
  gps: verificationRecords.gpsAtInspection,
  notes: verificationRecords.notes,
  validUntil: verificationRecords.validUntil,
  rejectionReason: verificationRecords.rejectionReason,
  createdAt: verificationRecords.createdAt,
};

const REVIEWABLE = ['SUBMITTED', 'IN_REVIEW'] as const;

/** Postgres returns `time` as HH:MM:SS; the API speaks HH:MM. */
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));

const activeVehicle = (userId: string, id: string) =>
  and(eq(vehicles.id, id), eq(vehicles.userId, userId), isNull(vehicles.deletedAt));

export function drizzleStore(db: Db): Store {
  async function withItems(record: Omit<VerificationRow, 'items'>): Promise<VerificationRow> {
    const items = await db
      .select({
        item: verificationItems.item,
        result: verificationItems.result,
        comment: verificationItems.comment,
      })
      .from(verificationItems)
      .where(eq(verificationItems.recordId, record.id))
      .orderBy(asc(verificationItems.item));
    return { ...record, items };
  }

  return {
    users: {
      async find(id) {
        const [row] = await db.select(userColumns).from(users).where(eq(users.id, id));
        return (row as UserRow | undefined) ?? null;
      },
      async ensure(id, init) {
        const inserted = await db
          .insert(users)
          .values({ id, phoneLast4: init.phoneLast4 })
          .onConflictDoNothing({ target: users.id })
          .returning(userColumns);
        if (inserted[0]) return { user: inserted[0] as UserRow, created: true };
        const [row] = await db.select(userColumns).from(users).where(eq(users.id, id));
        if (!row) throw new Error('user row missing after upsert');
        return { user: row as UserRow, created: false };
      },
      async setLookupHashes(id, hashes) {
        await db.update(users).set(hashes).where(eq(users.id, id));
      },
      async updateProfile(id, patch) {
        const [row] = await db
          .update(users)
          .set(patch)
          .where(eq(users.id, id))
          .returning(userColumns);
        if (!row) throw new Error('user not found');
        return row as UserRow;
      },
      async setStatus(id, status) {
        await db.update(users).set({ status }).where(eq(users.id, id));
      },
      async setMarketingOptIn(id, value) {
        await db.update(users).set({ marketingOptIn: value }).where(eq(users.id, id));
      },
      async roles(id) {
        return (await db
          .select({ role: userRoles.role, operatorId: userRoles.operatorId })
          .from(userRoles)
          .where(eq(userRoles.userId, id))) as RoleGrant[];
      },
    },

    consents: {
      async add(entry) {
        await db.insert(consents).values({ id: uuidv7(), ...entry });
      },
      async latest(userId) {
        const rows = await db
          .selectDistinctOn([consents.type], {
            type: consents.type,
            version: consents.version,
            granted: consents.granted,
          })
          .from(consents)
          .where(eq(consents.userId, userId))
          .orderBy(consents.type, desc(consents.createdAt), desc(consents.id));
        return Object.fromEntries(
          rows.map((r) => [r.type, { version: r.version, granted: r.granted }]),
        ) as Partial<Record<ConsentType, { version: string; granted: boolean }>>;
      },
    },

    vehicles: {
      async list(userId) {
        return (await db
          .select(vehicleColumns)
          .from(vehicles)
          .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)))
          .orderBy(asc(vehicles.createdAt), asc(vehicles.id))) as VehicleRow[];
      },
      async find(userId, id) {
        const [row] = await db
          .select(vehicleColumns)
          .from(vehicles)
          .where(activeVehicle(userId, id));
        return (row as VehicleRow | undefined) ?? null;
      },
      async create(row) {
        try {
          return await db.transaction(async (tx) => {
            if (row.isDefault) {
              await tx
                .update(vehicles)
                .set({ isDefault: false })
                .where(and(eq(vehicles.userId, row.userId), isNull(vehicles.deletedAt)));
            }
            const [created] = await tx
              .insert(vehicles)
              .values({ id: uuidv7(), ...row })
              .returning(vehicleColumns);
            return created as VehicleRow;
          });
        } catch (err) {
          if (isUniqueViolation(err, 'vehicles_user_plate_key')) throw new DuplicatePlateError();
          throw err;
        }
      },
      async update(userId, id, patch) {
        const [row] = await db
          .update(vehicles)
          .set(patch)
          .where(activeVehicle(userId, id))
          .returning(vehicleColumns);
        if (!row) throw new Error('vehicle not found');
        return row as VehicleRow;
      },
      async setDefault(userId, id) {
        await db.transaction(async (tx) => {
          await tx
            .update(vehicles)
            .set({ isDefault: false })
            .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)));
          await tx.update(vehicles).set({ isDefault: true }).where(activeVehicle(userId, id));
        });
      },
      async remove(userId, id) {
        await db.transaction(async (tx) => {
          const [removed] = await tx
            .update(vehicles)
            .set({ deletedAt: new Date(), isDefault: false })
            .where(activeVehicle(userId, id))
            .returning({ wasDefault: sql<boolean>`${vehicles.isDefault}` });
          if (!removed) return;
          const [hasDefault] = await tx
            .select({ id: vehicles.id })
            .from(vehicles)
            .where(
              and(
                eq(vehicles.userId, userId),
                isNull(vehicles.deletedAt),
                eq(vehicles.isDefault, true),
              ),
            );
          if (hasDefault) return;
          const [oldest] = await tx
            .select({ id: vehicles.id })
            .from(vehicles)
            .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)))
            .orderBy(asc(vehicles.createdAt), asc(vehicles.id))
            .limit(1);
          if (oldest)
            await tx.update(vehicles).set({ isDefault: true }).where(eq(vehicles.id, oldest.id));
        });
      },
    },

    devices: {
      async upsert(row) {
        await db
          .insert(devices)
          .values({ id: uuidv7(), ...row, lastSeenAt: new Date() })
          .onConflictDoUpdate({
            target: [devices.userId, devices.clientDeviceId],
            set: {
              platform: row.platform,
              appVersion: row.appVersion,
              authSessionId: row.authSessionId,
              ...(row.pushTokenEnc !== undefined ? { pushTokenEnc: row.pushTokenEnc } : {}),
              lastSeenAt: new Date(),
              revokedAt: null,
            },
          });
      },
      async revokeBySession(userId, authSessionId) {
        await db
          .update(devices)
          .set({ revokedAt: new Date() })
          .where(and(eq(devices.userId, userId), eq(devices.authSessionId, authSessionId)));
      },
      async revokeAll(userId) {
        await db
          .update(devices)
          .set({ revokedAt: new Date() })
          .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
      },
    },

    sessions: {
      async revokeAll(userId) {
        await db.execute(sql`select public.fn_revoke_user_sessions(${userId}::uuid)`);
      },
    },

    dataRequests: {
      async createDeletion(userId, dueAt) {
        try {
          const [row] = await db
            .insert(dataSubjectRequests)
            .values({ id: uuidv7(), userId, type: 'DELETION', dueAt })
            .returning({ id: dataSubjectRequests.id });
          if (!row) throw new Error('insert failed');
          return row;
        } catch (err) {
          if (isUniqueViolation(err, 'dsr_user_type_open_key')) throw new DsrAlreadyOpenError();
          throw err;
        }
      },
    },

    files: {
      async create(row) {
        const [created] = await db.insert(files).values(row).returning(fileColumns);
        if (!created) throw new Error('insert failed');
        return created as FileRow;
      },
      async find(id) {
        const [row] = await db.select(fileColumns).from(files).where(eq(files.id, id));
        return (row as FileRow | undefined) ?? null;
      },
      async markVerified(id, stored, at) {
        await db
          .update(files)
          .set({ ...stored, status: 'VERIFIED', verifiedAt: at, rejectionReason: null })
          .where(eq(files.id, id));
      },
      async markRejected(id, reason) {
        await db
          .update(files)
          .set({ status: 'REJECTED', rejectionReason: reason })
          .where(eq(files.id, id));
      },
    },

    kybDocuments: {
      async create(row) {
        const [doc] = await db
          .insert(operatorKybDocuments)
          .values({ id: uuidv7(), ...row })
          .returning(kybDocumentColumns);
        if (!doc) throw new Error('insert failed');
        return doc as KybDocumentRow;
      },
      async list(operatorId) {
        const rows = await db
          .select({
            ...kybDocumentColumns,
            mime: files.mime,
            sizeBytes: files.sizeBytes,
            fileStatus: files.status,
          })
          .from(operatorKybDocuments)
          .innerJoin(files, eq(files.id, operatorKybDocuments.fileId))
          .where(eq(operatorKybDocuments.operatorId, operatorId))
          .orderBy(desc(operatorKybDocuments.createdAt), desc(operatorKybDocuments.id));
        return rows as Awaited<ReturnType<Store['kybDocuments']['list']>>;
      },
      async find(operatorId, id) {
        const [doc] = await db
          .select(kybDocumentColumns)
          .from(operatorKybDocuments)
          .where(
            and(eq(operatorKybDocuments.id, id), eq(operatorKybDocuments.operatorId, operatorId)),
          );
        return (doc as KybDocumentRow | undefined) ?? null;
      },
      async remove(operatorId, id) {
        await db.transaction(async (tx) => {
          const [doc] = await tx
            .delete(operatorKybDocuments)
            .where(
              and(eq(operatorKybDocuments.id, id), eq(operatorKybDocuments.operatorId, operatorId)),
            )
            .returning({ fileId: operatorKybDocuments.fileId });
          if (doc)
            await tx
              .update(files)
              .set({ status: 'REJECTED', rejectionReason: 'DELETED' })
              .where(eq(files.id, doc.fileId));
        });
      },
    },

    payoutAccounts: {
      async upsert(row) {
        const values = { ...row, status: 'VERIFIED' as const, providerSubaccountCode: null };
        const [account] = await db
          .insert(payoutAccounts)
          .values({ id: uuidv7(), ...values })
          .onConflictDoUpdate({ target: payoutAccounts.operatorId, set: values })
          .returning(payoutColumns);
        if (!account) throw new Error('upsert failed');
        return account as PayoutAccountRow;
      },
      async find(operatorId) {
        const [account] = await db
          .select(payoutColumns)
          .from(payoutAccounts)
          .where(eq(payoutAccounts.operatorId, operatorId));
        return (account as PayoutAccountRow | undefined) ?? null;
      },
      async setSubaccount(operatorId, code) {
        await db
          .update(payoutAccounts)
          .set({ providerSubaccountCode: code })
          .where(eq(payoutAccounts.operatorId, operatorId));
      },
    },

    lots: {
      async create({ createdBy, ...row }) {
        try {
          const [lot] = await db
            .insert(lots)
            .values({ id: uuidv7(), ...row, createdBy })
            .returning(lotColumns);
          if (!lot) throw new Error('insert failed');
          return lot as LotRow;
        } catch (err) {
          if (isUniqueViolation(err, 'lots_slug_key')) throw new SlugTakenError();
          throw err;
        }
      },
      async find(operatorId, id) {
        const [lot] = await db
          .select(lotColumns)
          .from(lots)
          .where(and(eq(lots.id, id), eq(lots.operatorId, operatorId)));
        return (lot as LotRow | undefined) ?? null;
      },
      async findById(id) {
        const [lot] = await db.select(lotColumns).from(lots).where(eq(lots.id, id));
        return (lot as LotRow | undefined) ?? null;
      },
      async listByStatus(status) {
        const rows = await db
          .select({ ...lotColumns, operatorName: operators.legalName })
          .from(lots)
          .innerJoin(operators, eq(operators.id, lots.operatorId))
          .where(eq(lots.status, status))
          .orderBy(asc(lots.createdAt), asc(lots.id));
        if (rows.length === 0) return [];
        const counts = await db
          .select({ lotId: lotPhotos.lotId, n: sql<number>`count(*)::int` })
          .from(lotPhotos)
          .where(
            inArray(
              lotPhotos.lotId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(lotPhotos.lotId);
        const byLot = new Map(counts.map((c) => [c.lotId, c.n]));
        return rows.map((r) => ({
          ...(r as LotRow & { operatorName: string }),
          photoCount: byLot.get(r.id) ?? 0,
        }));
      },
      async list(operatorId) {
        const rows = (await db
          .select(lotColumns)
          .from(lots)
          .where(eq(lots.operatorId, operatorId))
          .orderBy(desc(lots.createdAt), desc(lots.id))) as LotRow[];
        if (rows.length === 0) return [];
        // A separate grouped count: inside a select list drizzle renders columns
        // without their table, so a correlated subquery would compare
        // lot_photos.lot_id with lot_photos.id and always count 0.
        const counts = await db
          .select({ lotId: lotPhotos.lotId, n: sql<number>`count(*)::int` })
          .from(lotPhotos)
          .where(
            inArray(
              lotPhotos.lotId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(lotPhotos.lotId);
        const byLot = new Map(counts.map((c) => [c.lotId, c.n]));
        return rows.map((r) => ({ ...r, photoCount: byLot.get(r.id) ?? 0 }));
      },
      async update(operatorId, id, version, patch) {
        const [lot] = await db
          .update(lots)
          .set({ ...patch, version: sql`${lots.version} + 1` })
          .where(and(eq(lots.id, id), eq(lots.operatorId, operatorId), eq(lots.version, version)))
          .returning(lotColumns);
        if (!lot) throw new StaleVersionError();
        return lot as LotRow;
      },
      async setStatus(operatorId, id, from, to, reason) {
        const [lot] = await db
          .update(lots)
          .set({
            status: to,
            statusReason: reason,
            verifiedBadge: to === 'LIVE',
            version: sql`${lots.version} + 1`,
          })
          .where(and(eq(lots.id, id), eq(lots.operatorId, operatorId), eq(lots.status, from)))
          .returning(lotColumns);
        if (!lot) throw new StaleVersionError();
        return lot as LotRow;
      },
      async openingHours(lotId) {
        const rows = await db
          .select({
            weekday: lotOpeningHours.weekday,
            is24h: lotOpeningHours.is24h,
            opensAt: lotOpeningHours.opensAt,
            closesAt: lotOpeningHours.closesAt,
          })
          .from(lotOpeningHours)
          .where(eq(lotOpeningHours.lotId, lotId))
          .orderBy(asc(lotOpeningHours.weekday));
        return rows.map((r): OpeningHourRow => ({
          ...r,
          opensAt: hhmm(r.opensAt),
          closesAt: hhmm(r.closesAt),
        }));
      },
      async setOpeningHours(lotId, days) {
        await db.transaction(async (tx) => {
          await tx.delete(lotOpeningHours).where(eq(lotOpeningHours.lotId, lotId));
          if (days.length > 0)
            await tx
              .insert(lotOpeningHours)
              .values(days.map((d) => ({ id: uuidv7(), lotId, ...d })));
        });
      },
    },

    permits: {
      async create(row) {
        const [permit] = await db
          .insert(permits)
          .values({ id: uuidv7(), ...row })
          .returning(permitColumns);
        if (!permit) throw new Error('insert failed');
        return permit as PermitRow;
      },
      async latest(lotId) {
        const [permit] = await db
          .select(permitColumns)
          .from(permits)
          .where(eq(permits.lotId, lotId))
          .orderBy(desc(permits.createdAt), desc(permits.id))
          .limit(1);
        return (permit as PermitRow | undefined) ?? null;
      },
      async find(id) {
        const [permit] = await db.select(permitColumns).from(permits).where(eq(permits.id, id));
        return (permit as PermitRow | undefined) ?? null;
      },
      async approve(id, { reviewerId, at, note }) {
        const [permit] = await db
          .update(permits)
          .set({ status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: at, reviewNote: note })
          .where(and(eq(permits.id, id), inArray(permits.status, [...REVIEWABLE])))
          .returning(permitColumns);
        if (!permit) throw new StaleVersionError();
        return permit as PermitRow;
      },
      async reject(id, { reviewerId, at, reason }) {
        const [permit] = await db
          .update(permits)
          .set({
            status: 'REJECTED',
            reviewedBy: reviewerId,
            reviewedAt: at,
            rejectionReason: reason,
          })
          .where(and(eq(permits.id, id), inArray(permits.status, [...REVIEWABLE])))
          .returning(permitColumns);
        if (!permit) throw new StaleVersionError();
        return permit as PermitRow;
      },
      async dueForExpiryCheck(today, limit) {
        // Same buckets as the domain's permitExpiryAction: the nearest reminder not yet sent.
        const daysLeft = sql`(${permits.expiresAt} - ${today}::date)`;
        const rows = await db
          .select(permitColumns)
          .from(permits)
          .where(
            and(
              eq(permits.status, 'APPROVED'),
              sql`${daysLeft} <= 30`,
              or(
                sql`${daysLeft} <= 0`,
                isNull(permits.lastReminderDays),
                sql`${permits.lastReminderDays} > case when ${daysLeft} <= 1 then 1 when ${daysLeft} <= 7 then 7 when ${daysLeft} <= 14 then 14 else 30 end`,
              ),
            ),
          )
          .orderBy(asc(permits.expiresAt), asc(permits.id))
          .limit(limit);
        return rows as PermitRow[];
      },
      async markReminded(id, days) {
        await db
          .update(permits)
          .set({ lastReminderDays: days })
          .where(
            and(
              eq(permits.id, id),
              or(isNull(permits.lastReminderDays), sql`${permits.lastReminderDays} > ${days}`),
            ),
          );
      },
      async expire(id) {
        const rows = await db
          .update(permits)
          .set({ status: 'EXPIRED' })
          .where(and(eq(permits.id, id), eq(permits.status, 'APPROVED')))
          .returning({ id: permits.id });
        return rows.length > 0;
      },
    },

    ratePlans: {
      async submit({ submittedBy, ...row }) {
        // One pending change per (lot, product): replace it rather than add a second.
        const prices = {
          hourlyRateKobo: row.hourlyRateKobo,
          minMinutes: row.minMinutes,
          dailyCapKobo: row.dailyCapKobo,
          dailyRateKobo: row.dailyRateKobo,
          monthlyRateKobo: row.monthlyRateKobo,
        };
        const [updated] = await db
          .update(ratePlans)
          .set({ ...prices, submittedBy })
          .where(
            and(
              eq(ratePlans.lotId, row.lotId),
              eq(ratePlans.product, row.product),
              eq(ratePlans.status, 'PENDING_APPROVAL'),
            ),
          )
          .returning(ratePlanColumns);
        if (updated) return updated as RatePlanRow;
        const [created] = await db
          .insert(ratePlans)
          .values({ id: uuidv7(), ...row, submittedBy, status: 'PENDING_APPROVAL' })
          .returning(ratePlanColumns);
        if (!created) throw new Error('insert failed');
        return created as RatePlanRow;
      },
      async current(lotId) {
        const rows = await db
          .select(ratePlanColumns)
          .from(ratePlans)
          .where(
            and(
              eq(ratePlans.lotId, lotId),
              inArray(ratePlans.status, ['ACTIVE', 'PENDING_APPROVAL']),
            ),
          )
          .orderBy(asc(ratePlans.product), asc(ratePlans.createdAt));
        return rows as RatePlanRow[];
      },
      async find(id) {
        const [plan] = await db.select(ratePlanColumns).from(ratePlans).where(eq(ratePlans.id, id));
        return (plan as RatePlanRow | undefined) ?? null;
      },
      async approve(id, { reviewerId, at }) {
        return db.transaction(async (tx) => {
          const [pending] = await tx
            .select({ lotId: ratePlans.lotId, product: ratePlans.product })
            .from(ratePlans)
            .where(and(eq(ratePlans.id, id), eq(ratePlans.status, 'PENDING_APPROVAL')))
            .for('update');
          if (!pending) throw new StaleVersionError();
          // Retire first: the partial unique index allows one ACTIVE plan per product.
          await tx
            .update(ratePlans)
            .set({ status: 'RETIRED' })
            .where(
              and(
                eq(ratePlans.lotId, pending.lotId),
                eq(ratePlans.product, pending.product),
                eq(ratePlans.status, 'ACTIVE'),
              ),
            );
          const [plan] = await tx
            .update(ratePlans)
            .set({ status: 'ACTIVE', effectiveFrom: at, approvedBy: reviewerId, approvedAt: at })
            .where(eq(ratePlans.id, id))
            .returning(ratePlanColumns);
          return plan as RatePlanRow;
        });
      },
      async reject(id, { reviewerId, at, reason }) {
        const [plan] = await db
          .update(ratePlans)
          .set({
            status: 'REJECTED',
            approvedBy: reviewerId,
            approvedAt: at,
            rejectionReason: reason,
          })
          .where(and(eq(ratePlans.id, id), eq(ratePlans.status, 'PENDING_APPROVAL')))
          .returning(ratePlanColumns);
        if (!plan) throw new StaleVersionError();
        return plan as RatePlanRow;
      },
    },

    lotPhotos: {
      async create(row) {
        const [photo] = await db
          .insert(lotPhotos)
          .values({ id: uuidv7(), ...row })
          .returning(photoColumns);
        if (!photo) throw new Error('insert failed');
        return photo as LotPhotoRow;
      },
      async list(lotId) {
        const rows = await db
          .select({ ...photoColumns, sizeBytes: files.sizeBytes })
          .from(lotPhotos)
          .innerJoin(files, eq(files.id, lotPhotos.fileId))
          .where(eq(lotPhotos.lotId, lotId))
          .orderBy(asc(lotPhotos.sort), asc(lotPhotos.createdAt));
        return rows as (LotPhotoRow & { sizeBytes: number })[];
      },
      async find(lotId, id) {
        const [photo] = await db
          .select(photoColumns)
          .from(lotPhotos)
          .where(and(eq(lotPhotos.id, id), eq(lotPhotos.lotId, lotId)));
        return (photo as LotPhotoRow | undefined) ?? null;
      },
      async findById(id) {
        const [photo] = await db.select(photoColumns).from(lotPhotos).where(eq(lotPhotos.id, id));
        return (photo as LotPhotoRow | undefined) ?? null;
      },
      async review(id, decision, { reviewerId, at }) {
        const [photo] = await db
          .update(lotPhotos)
          .set({ ...decision, reviewedBy: reviewerId, reviewedAt: at })
          .where(and(eq(lotPhotos.id, id), eq(lotPhotos.status, 'PENDING')))
          .returning(photoColumns);
        if (!photo) throw new StaleVersionError();
        return photo as LotPhotoRow;
      },
      async remove(lotId, id) {
        await db.transaction(async (tx) => {
          const [photo] = await tx
            .delete(lotPhotos)
            .where(and(eq(lotPhotos.id, id), eq(lotPhotos.lotId, lotId)))
            .returning({ fileId: lotPhotos.fileId });
          if (photo)
            await tx
              .update(files)
              .set({ status: 'REJECTED', rejectionReason: 'DELETED' })
              .where(eq(files.id, photo.fileId));
        });
      },
    },

    verifications: {
      async create({ items, gps, ...row }) {
        return db.transaction(async (tx) => {
          const [record] = await tx
            .insert(verificationRecords)
            .values({ id: uuidv7(), ...row, gpsAtInspection: gps })
            .returning(verificationColumns);
          if (!record) throw new Error('insert failed');
          await tx
            .insert(verificationItems)
            .values(items.map((i) => ({ id: uuidv7(), recordId: record.id, ...i })));
          return {
            ...(record as Omit<VerificationRow, 'items'>),
            items: items.map((i) => ({ ...i })),
          };
        });
      },
      async latest(lotId) {
        const [record] = await db
          .select(verificationColumns)
          .from(verificationRecords)
          .where(eq(verificationRecords.lotId, lotId))
          .orderBy(desc(verificationRecords.createdAt), desc(verificationRecords.id))
          .limit(1);
        return record ? withItems(record as Omit<VerificationRow, 'items'>) : null;
      },
      async find(id) {
        const [record] = await db
          .select(verificationColumns)
          .from(verificationRecords)
          .where(eq(verificationRecords.id, id));
        return record ? withItems(record as Omit<VerificationRow, 'items'>) : null;
      },
      async approve(id, { reviewerId, at }) {
        const record = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(verificationRecords)
            .set({ status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: at })
            .where(
              and(
                eq(verificationRecords.id, id),
                inArray(verificationRecords.status, [...REVIEWABLE]),
              ),
            )
            .returning(verificationColumns);
          if (!row) throw new StaleVersionError();
          // Doc 03 §4.1: a lower count on site overrides the operator's figure.
          await tx
            .update(lots)
            .set({
              capacityTotal: row.capacityCounted,
              capacityBookable: sql`least(${lots.capacityBookable}, ${row.capacityCounted})`,
              version: sql`${lots.version} + 1`,
            })
            .where(
              and(eq(lots.id, row.lotId), sql`${lots.capacityTotal} > ${row.capacityCounted}`),
            );
          return row as Omit<VerificationRow, 'items'>;
        });
        return withItems(record);
      },
      async reject(id, { reviewerId, at, reason }) {
        const [row] = await db
          .update(verificationRecords)
          .set({
            status: 'REJECTED',
            reviewedBy: reviewerId,
            reviewedAt: at,
            rejectionReason: reason,
          })
          .where(
            and(
              eq(verificationRecords.id, id),
              inArray(verificationRecords.status, [...REVIEWABLE]),
            ),
          )
          .returning(verificationColumns);
        if (!row) throw new StaleVersionError();
        return withItems(row as Omit<VerificationRow, 'items'>);
      },
    },

    members: {
      async list(operatorId) {
        const rows = await db
          .select({ ...memberColumns, firstName: users.firstName, lastName: users.lastName })
          .from(operatorMembers)
          .leftJoin(users, eq(users.id, operatorMembers.userId))
          .where(
            and(eq(operatorMembers.operatorId, operatorId), ne(operatorMembers.status, 'REMOVED')),
          )
          .orderBy(asc(operatorMembers.createdAt), asc(operatorMembers.id));
        return rows as (MemberRow & { firstName: string | null; lastName: string | null })[];
      },
      async find(operatorId, id) {
        const [row] = await db
          .select(memberColumns)
          .from(operatorMembers)
          .where(and(eq(operatorMembers.id, id), eq(operatorMembers.operatorId, operatorId)));
        return (row as MemberRow | undefined) ?? null;
      },
      async findByContact(operatorId, { phoneHash, emailHash }, now) {
        const matchesUser = or(
          phoneHash ? eq(users.phoneHash, phoneHash) : undefined,
          emailHash ? eq(users.emailHash, emailHash) : undefined,
        );
        const matchesInvite = or(
          phoneHash ? eq(operatorMembers.inviteePhoneHash, phoneHash) : undefined,
          emailHash ? eq(operatorMembers.inviteeEmailHash, emailHash) : undefined,
        );
        if (!matchesUser || !matchesInvite) return null;
        const [row] = await db
          .select(memberColumns)
          .from(operatorMembers)
          .leftJoin(users, eq(users.id, operatorMembers.userId))
          .where(
            and(
              eq(operatorMembers.operatorId, operatorId),
              or(
                and(eq(operatorMembers.status, 'ACTIVE'), matchesUser),
                and(
                  eq(operatorMembers.status, 'INVITED'),
                  gt(operatorMembers.inviteExpiresAt, now),
                  matchesInvite,
                ),
              ),
            ),
          )
          .limit(1);
        return (row as MemberRow | undefined) ?? null;
      },
      async invite(row) {
        const [member] = await db
          .insert(operatorMembers)
          .values({ id: uuidv7(), ...row, status: 'INVITED' })
          .returning(memberColumns);
        if (!member) throw new Error('insert failed');
        return member as MemberRow;
      },
      async findByToken(tokenHash) {
        const [row] = await db
          .select({
            ...memberColumns,
            inviteePhoneHash: operatorMembers.inviteePhoneHash,
            inviteeEmailHash: operatorMembers.inviteeEmailHash,
          })
          .from(operatorMembers)
          .where(eq(operatorMembers.inviteTokenHash, tokenHash));
        return (
          (row as
            | (MemberRow & { inviteePhoneHash: Buffer | null; inviteeEmailHash: Buffer | null })
            | undefined) ?? null
        );
      },
      async accept(id, userId, at) {
        try {
          return await db.transaction(async (tx) => {
            const [member] = await tx
              .update(operatorMembers)
              .set({ status: 'ACTIVE', userId, acceptedAt: at, inviteTokenHash: null })
              .where(and(eq(operatorMembers.id, id), eq(operatorMembers.status, 'INVITED')))
              .returning(memberColumns);
            if (!member) throw new StaleVersionError();
            await tx
              .insert(userRoles)
              .values({
                id: uuidv7(),
                userId,
                role: MEMBER_ROLE[member.role],
                operatorId: member.operatorId,
                grantedBy: member.invitedBy,
              })
              .onConflictDoNothing();
            return member as MemberRow;
          });
        } catch (err) {
          if (isUniqueViolation(err, 'operator_members_operator_user_key'))
            throw new MemberExistsError();
          throw err;
        }
      },
      async remove(operatorId, id, at) {
        return db.transaction(async (tx) => {
          const [before] = await tx
            .select({ status: operatorMembers.status })
            .from(operatorMembers)
            .where(and(eq(operatorMembers.id, id), eq(operatorMembers.operatorId, operatorId)))
            .for('update');
          const [member] = await tx
            .update(operatorMembers)
            .set({ status: 'REMOVED', removedAt: at, inviteTokenHash: null })
            .where(
              and(
                eq(operatorMembers.id, id),
                eq(operatorMembers.operatorId, operatorId),
                ne(operatorMembers.status, 'REMOVED'),
              ),
            )
            .returning(memberColumns);
          if (!member) throw new StaleVersionError();
          if (before?.status === 'ACTIVE' && member.userId)
            await tx
              .delete(userRoles)
              .where(
                and(
                  eq(userRoles.userId, member.userId),
                  eq(userRoles.role, MEMBER_ROLE[member.role]),
                  eq(userRoles.operatorId, operatorId),
                ),
              );
          return member as MemberRow;
        });
      },
      async attendantLotIds(userId) {
        const rows = await db
          .select({ operatorId: operatorMembers.operatorId, lotIds: operatorMembers.lotIds })
          .from(operatorMembers)
          .where(
            and(
              eq(operatorMembers.userId, userId),
              eq(operatorMembers.role, 'ATTENDANT'),
              eq(operatorMembers.status, 'ACTIVE'),
            ),
          );
        const ids: string[] = [];
        for (const m of rows) {
          if (m.lotIds.length > 0) ids.push(...m.lotIds);
          else
            ids.push(
              ...(
                await db.select({ id: lots.id }).from(lots).where(eq(lots.operatorId, m.operatorId))
              ).map((l) => l.id),
            );
        }
        return ids;
      },
    },

    flags: {
      async enabled(key) {
        const [row] = await db
          .select({ enabled: featureFlags.enabled })
          .from(featureFlags)
          .where(eq(featureFlags.key, key));
        return row?.enabled ?? false;
      },
    },

    audit: {
      async write(entry) {
        await db.insert(auditLogs).values({ id: uuidv7(), ...entry });
      },
      async list(q) {
        const filters = [
          q.entityType ? eq(auditLogs.entityType, q.entityType) : undefined,
          q.entityId ? eq(auditLogs.entityId, q.entityId) : undefined,
          q.actorUserId ? eq(auditLogs.actorUserId, q.actorUserId) : undefined,
          q.before
            ? or(
                lt(auditLogs.createdAt, q.before.createdAt),
                and(eq(auditLogs.createdAt, q.before.createdAt), lt(auditLogs.id, q.before.id)),
              )
            : undefined,
        ];
        const rows = await db
          .select()
          .from(auditLogs)
          .where(and(...filters))
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(q.limit);
        return rows.map((r) => ({ ...r, ipHash: r.ipHash ?? null }));
      },
    },

    operators: {
      async create({ ownerUserId, ...details }) {
        return db.transaction(async (tx) => {
          // Serialise creates per user so a double submit cannot make two operators.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${'operator-owner:' + ownerUserId}))`,
          );
          const [existing] = await tx
            .select({ id: userRoles.id })
            .from(userRoles)
            .where(and(eq(userRoles.userId, ownerUserId), eq(userRoles.role, 'OPERATOR_OWNER')))
            .limit(1);
          if (existing) throw new OperatorExistsError();

          const id = uuidv7();
          const [row] = await tx
            .insert(operators)
            .values({ id, ...details, createdBy: ownerUserId })
            .returning(operatorColumns);
          await tx.insert(operatorMembers).values({
            id: uuidv7(),
            operatorId: id,
            userId: ownerUserId,
            role: 'OWNER',
            status: 'ACTIVE',
            acceptedAt: new Date(),
          });
          await tx.insert(userRoles).values({
            id: uuidv7(),
            userId: ownerUserId,
            role: 'OPERATOR_OWNER',
            operatorId: id,
            grantedBy: ownerUserId,
          });
          if (!row) throw new Error('operator insert failed');
          return row as OperatorRow;
        });
      },
      async find(id) {
        const [row] = await db.select(operatorColumns).from(operators).where(eq(operators.id, id));
        return (row as OperatorRow | undefined) ?? null;
      },
      async update(id, patch) {
        const [row] = await db
          .update(operators)
          .set(patch)
          .where(eq(operators.id, id))
          .returning(operatorColumns);
        if (!row) throw new Error(`no operator ${id}`);
        return row as OperatorRow;
      },
      async submitKyb(id, at) {
        const [row] = await db
          .update(operators)
          .set({ kybStatus: 'SUBMITTED', kybSubmittedAt: at, kybRejectionReason: null })
          .where(eq(operators.id, id))
          .returning(operatorColumns);
        if (!row) throw new Error(`no operator ${id}`);
        return row as OperatorRow;
      },
      async list({ kybStatus }) {
        const rows = await db
          .select(operatorColumns)
          .from(operators)
          .where(kybStatus ? eq(operators.kybStatus, kybStatus) : undefined)
          .orderBy(asc(operators.kybSubmittedAt), asc(operators.createdAt));
        return rows as OperatorRow[];
      },
      async approveKyb(id, { reviewerId, at }) {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(operators)
            .set({
              kybStatus: 'APPROVED',
              status: 'ACTIVE',
              kybReviewedBy: reviewerId,
              kybReviewedAt: at,
              kybRejectionReason: null,
            })
            .where(and(eq(operators.id, id), eq(operators.kybStatus, 'SUBMITTED')))
            .returning(operatorColumns);
          if (!row) throw new StaleVersionError();
          await tx
            .update(operatorKybDocuments)
            .set({ status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: at })
            .where(eq(operatorKybDocuments.operatorId, id));
          // CHECK payout_accounts_active_has_subaccount refuses ACTIVE without the code.
          await tx
            .update(payoutAccounts)
            .set({ status: 'ACTIVE', activatedAt: at, pendingAccountNumberEnc: null })
            .where(eq(payoutAccounts.operatorId, id));
          return row as OperatorRow;
        });
      },
      async rejectKyb(id, { reviewerId, at, reason }) {
        const [row] = await db
          .update(operators)
          .set({
            kybStatus: 'REJECTED',
            kybReviewedBy: reviewerId,
            kybReviewedAt: at,
            kybRejectionReason: reason,
          })
          .where(and(eq(operators.id, id), eq(operators.kybStatus, 'SUBMITTED')))
          .returning(operatorColumns);
        if (!row) throw new StaleVersionError();
        return row as OperatorRow;
      },
      async ownedBy(userId) {
        const [row] = await db
          .select({ operatorId: userRoles.operatorId })
          .from(userRoles)
          .where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'OPERATOR_OWNER')))
          .limit(1);
        return row?.operatorId ?? null;
      },
      async members(operatorId) {
        return db
          .select({ userId: userRoles.userId, role: userRoles.role, firstName: users.firstName })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(
            and(
              eq(userRoles.operatorId, operatorId),
              inArray(userRoles.role, ['OPERATOR_OWNER', 'OPERATOR_MANAGER', 'OPERATOR_ATTENDANT']),
            ),
          );
      },
    },

    settings: {
      async get<T>(key: string) {
        const [row] = await db
          .select({ value: platformSettings.value })
          .from(platformSettings)
          .where(eq(platformSettings.key, key));
        return row?.value as T | undefined;
      },
    },
  };
}
