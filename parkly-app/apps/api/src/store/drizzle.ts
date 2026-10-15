import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import type { RoleGrant } from '@parkly/domain/authz';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  DsrAlreadyOpenError,
  DuplicatePlateError,
  type ConsentType,
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
