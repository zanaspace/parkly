import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import type { RoleGrant } from '@parkly/domain/authz';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  DsrAlreadyOpenError,
  DuplicatePlateError,
  OperatorExistsError,
  SlugTakenError,
  StaleVersionError,
  type ConsentType,
  type FileRow,
  type KybDocumentRow,
  type LotPhotoRow,
  type LotRow,
  type OpeningHourRow,
  type PayoutAccountRow,
  type OperatorRow,
  type Store,
  type UserRow,
  type VehicleRow,
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
  sort: lotPhotos.sort,
  status: lotPhotos.status,
  createdAt: lotPhotos.createdAt,
};

/** Postgres returns `time` as HH:MM:SS; the API speaks HH:MM. */
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));

const activeVehicle = (userId: string, id: string) =>
  and(eq(vehicles.id, id), eq(vehicles.userId, userId), isNull(vehicles.deletedAt));

export function drizzleStore(db: Db): Store {
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
      async list(operatorId) {
        const rows = await db
          .select({
            ...lotColumns,
            photoCount: sql<number>`(select count(*)::int from ${lotPhotos} where ${lotPhotos.lotId} = ${lots.id})`,
          })
          .from(lots)
          .where(eq(lots.operatorId, operatorId))
          .orderBy(desc(lots.createdAt), desc(lots.id));
        return rows as (LotRow & { photoCount: number })[];
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
          .set({ kybStatus: 'SUBMITTED', kybSubmittedAt: at })
          .where(eq(operators.id, id))
          .returning(operatorColumns);
        if (!row) throw new Error(`no operator ${id}`);
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
