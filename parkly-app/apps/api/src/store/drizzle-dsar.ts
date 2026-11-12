import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { pseudonymise } from '../lib/pseudonym.js';
import { DsrAlreadyOpenError, type DataRequestRow, type Store, type UserStatus } from './types.js';

const {
  bookings,
  dataSubjectRequests,
  devices,
  erasureLog,
  idempotencyKeys,
  notifications,
  sessions,
  userRoles,
  users,
  vehicles,
} = schema;

const columns = {
  id: dataSubjectRequests.id,
  userId: dataSubjectRequests.userId,
  type: dataSubjectRequests.type,
  status: dataSubjectRequests.status,
  dueAt: dataSubjectRequests.dueAt,
  completedAt: dataSubjectRequests.completedAt,
  exportStoragePath: dataSubjectRequests.exportStoragePath,
  createdAt: dataSubjectRequests.createdAt,
};

const OPEN_DSR = ['OPEN', 'IN_PROGRESS'] as const;

function isOpenViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: unknown };
  const cause = e.cause as { code?: string; constraint_name?: string } | undefined;
  return (
    (e.code === '23505' || cause?.code === '23505') &&
    [e.constraint_name, cause?.constraint_name].includes('dsr_user_type_open_key')
  );
}

/** FR-AUTH-007, NFR-PRIV-001: data requests, account erasure and retention purges. */
export function drizzleDsar(db: Db): Pick<Store, 'erasure' | 'retention'> & {
  dataRequests: Omit<Store['dataRequests'], 'createDeletion'>;
} {
  const create = async (userId: string, type: 'ACCESS', dueAt: Date) => {
    try {
      const [row] = await db
        .insert(dataSubjectRequests)
        .values({ id: uuidv7(), userId, type, dueAt })
        .returning({ id: dataSubjectRequests.id });
      if (!row) throw new Error('insert failed');
      return row;
    } catch (err) {
      if (isOpenViolation(err)) throw new DsrAlreadyOpenError();
      throw err;
    }
  };

  return {
    dataRequests: {
      createAccess: (userId, dueAt) => create(userId, 'ACCESS', dueAt),

      async find(id) {
        const [row] = await db
          .select(columns)
          .from(dataSubjectRequests)
          .where(eq(dataSubjectRequests.id, id));
        return (row as DataRequestRow | undefined) ?? null;
      },

      async listForUser(userId) {
        const rows = await db
          .select(columns)
          .from(dataSubjectRequests)
          .where(eq(dataSubjectRequests.userId, userId))
          .orderBy(desc(dataSubjectRequests.createdAt));
        return rows as DataRequestRow[];
      },

      async cancelDeletion(userId, at) {
        const rows = await db
          .update(dataSubjectRequests)
          .set({ status: 'CANCELLED', completedAt: at, updatedAt: at })
          .where(
            and(
              eq(dataSubjectRequests.userId, userId),
              eq(dataSubjectRequests.type, 'DELETION'),
              inArray(dataSubjectRequests.status, [...OPEN_DSR]),
            ),
          )
          .returning({ id: dataSubjectRequests.id });
        return rows.length > 0;
      },

      async dueDeletions(now, limit) {
        const rows = await db
          .select(columns)
          .from(dataSubjectRequests)
          .where(
            and(
              eq(dataSubjectRequests.type, 'DELETION'),
              inArray(dataSubjectRequests.status, [...OPEN_DSR]),
              lte(dataSubjectRequests.dueAt, now),
            ),
          )
          .orderBy(asc(dataSubjectRequests.dueAt))
          .limit(limit);
        return rows as DataRequestRow[];
      },

      async complete(id, at, exportStoragePath) {
        const rows = await db
          .update(dataSubjectRequests)
          .set({
            status: 'COMPLETED',
            completedAt: at,
            updatedAt: at,
            ...(exportStoragePath ? { exportStoragePath } : {}),
          })
          .where(
            and(eq(dataSubjectRequests.id, id), inArray(dataSubjectRequests.status, [...OPEN_DSR])),
          )
          .returning({ id: dataSubjectRequests.id });
        return rows.length > 0;
      },

      async listAdmin({ status, type, limit }) {
        const where: SQL[] = [];
        if (status) where.push(eq(dataSubjectRequests.status, status));
        if (type) where.push(eq(dataSubjectRequests.type, type));
        const rows = await db
          .select({ ...columns, userFirstName: users.firstName, userStatus: users.status })
          .from(dataSubjectRequests)
          .innerJoin(users, eq(dataSubjectRequests.userId, users.id))
          .where(where.length ? and(...where) : undefined)
          .orderBy(desc(dataSubjectRequests.createdAt))
          .limit(limit);
        return rows as (DataRequestRow & {
          userFirstName: string | null;
          userStatus: UserStatus;
        })[];
      },

      async expiredExports(before, limit) {
        const rows = await db
          .select({ id: dataSubjectRequests.id, path: dataSubjectRequests.exportStoragePath })
          .from(dataSubjectRequests)
          .where(
            and(
              isNotNull(dataSubjectRequests.exportStoragePath),
              lt(dataSubjectRequests.completedAt, before),
            ),
          )
          .limit(limit);
        return rows.flatMap((r) => (r.path ? [{ id: r.id, path: r.path }] : []));
      },

      async clearExport(id) {
        await db
          .update(dataSubjectRequests)
          .set({ exportStoragePath: null })
          .where(eq(dataSubjectRequests.id, id));
      },

      async obligations(userId, now) {
        const [active] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.driverId, userId),
              or(
                eq(bookings.status, 'CHECKED_IN'),
                and(eq(bookings.status, 'CONFIRMED'), gt(bookings.endAt, now)),
              ),
            ),
          );
        const [owed] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(sessions)
          .innerJoin(bookings, eq(sessions.bookingId, bookings.id))
          .where(
            and(eq(bookings.driverId, userId), inArray(sessions.overstayStatus, ['DUE', 'UNPAID'])),
          );
        return { activeBookings: active?.n ?? 0, unpaidOverstays: owed?.n ?? 0 };
      },
    },

    erasure: {
      async eraseUser(userId, dsrId, at) {
        return db.transaction(async (tx) => {
          const [user] = await tx
            .select({ status: users.status })
            .from(users)
            .where(eq(users.id, userId))
            .for('update');
          if (!user || user.status === 'DELETED') return null;

          const salt = randomUUID();
          const own = await tx
            .select({ id: vehicles.id, plateNorm: vehicles.plateNorm })
            .from(vehicles)
            .where(eq(vehicles.userId, userId));
          const bookingPlates = await tx
            .selectDistinct({ plate: bookings.plateNormSnapshot })
            .from(bookings)
            .where(eq(bookings.driverId, userId));

          // Plates on bookings and parking sessions: one-way pseudonyms.
          const plates = new Set([
            ...own.map((v) => v.plateNorm),
            ...bookingPlates.map((b) => b.plate),
          ]);
          for (const plate of plates) {
            const p = pseudonymise(plate, salt);
            await tx
              .update(bookings)
              .set({ plateNormSnapshot: p })
              .where(and(eq(bookings.driverId, userId), eq(bookings.plateNormSnapshot, plate)));
            await tx
              .update(sessions)
              .set({ plateNorm: p })
              .where(
                and(
                  eq(sessions.plateNorm, plate),
                  inArray(
                    sessions.bookingId,
                    tx
                      .select({ id: bookings.id })
                      .from(bookings)
                      .where(eq(bookings.driverId, userId)),
                  ),
                ),
              );
          }

          // Vehicles: gone, unless a booking still points at one; then it is scrubbed.
          const used = await tx
            .selectDistinct({ id: bookings.vehicleId })
            .from(bookings)
            .where(eq(bookings.driverId, userId));
          const usedIds = used.map((u) => u.id);
          const keep = own.filter((v) => usedIds.includes(v.id));
          for (const v of keep) {
            const p = pseudonymise(v.plateNorm, salt);
            await tx
              .update(vehicles)
              .set({
                plateRaw: p,
                plateNorm: p,
                make: null,
                model: null,
                colour: null,
                isDefault: false,
                updatedAt: at,
              })
              .where(eq(vehicles.id, v.id));
          }
          await tx
            .delete(vehicles)
            .where(
              and(
                eq(vehicles.userId, userId),
                usedIds.length ? notInArray(vehicles.id, usedIds) : undefined,
              ),
            );

          await tx.delete(devices).where(eq(devices.userId, userId));
          await tx.delete(userRoles).where(eq(userRoles.userId, userId));
          const gone = await tx
            .delete(notifications)
            .where(eq(notifications.userId, userId))
            .returning({ id: notifications.id });

          await tx
            .update(users)
            .set({
              phoneHash: null,
              phoneLast4: null,
              emailHash: null,
              phoneEnc: null,
              emailEnc: null,
              firstName: null,
              lastName: null,
              marketingOptIn: false,
              status: 'DELETED',
              deletedAt: at,
              updatedAt: at,
            })
            .where(eq(users.id, userId));

          await tx
            .update(dataSubjectRequests)
            .set({ status: 'COMPLETED', completedAt: at, updatedAt: at })
            .where(eq(dataSubjectRequests.id, dsrId));
          await tx
            .insert(erasureLog)
            .values({ id: uuidv7(), userId, dsrId, createdAt: at })
            .onConflictDoNothing();

          return {
            vehicles: own.length,
            bookings: bookingPlates.length,
            notifications: gone.length,
          };
        });
      },
    },

    retention: {
      async purgeIdempotencyKeys(before, limit) {
        const rows = await db
          .delete(idempotencyKeys)
          .where(
            sql`(${idempotencyKeys.actorId}, ${idempotencyKeys.key}) in (
              select actor_id, key from idempotency_keys
              where expires_at < ${before.toISOString()}::timestamptz limit ${limit}
            )`,
          )
          .returning({ key: idempotencyKeys.key });
        return rows.length;
      },
      async purgeNotifications(before, limit) {
        const rows = await db
          .delete(notifications)
          .where(
            inArray(
              notifications.id,
              db
                .select({ id: notifications.id })
                .from(notifications)
                .where(
                  and(
                    lt(notifications.createdAt, before),
                    sql`${notifications.status} <> 'PENDING'`,
                  ),
                )
                .limit(limit),
            ),
          )
          .returning({ id: notifications.id });
        return rows.length;
      },
    },
  };
}
