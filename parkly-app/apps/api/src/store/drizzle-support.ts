import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Store, SupportBookingRow } from './types.js';

const { bookings, bookingStatusHistory, lots, operators, payments, users } = schema;

const columns = {
  id: bookings.id,
  code: bookings.code,
  status: bookings.status,
  lotName: lots.name,
  operatorName: operators.tradingName,
  startAt: bookings.startAt,
  endAt: bookings.endAt,
  plateNorm: bookings.plateNormSnapshot,
  totalKobo: bookings.totalKobo,
  driverId: bookings.driverId,
  driverFirstName: users.firstName,
  driverPhoneLast4: users.phoneLast4,
  driverHasEmail: sql<boolean>`${users.emailEnc} is not null`,
  createdAt: bookings.createdAt,
};

/** FR-ADM-002: support search and history. Driver details stay masked here. */
export function drizzleSupport(db: Db): Store['support'] {
  const base = () =>
    db
      .select(columns)
      .from(bookings)
      .innerJoin(lots, eq(bookings.lotId, lots.id))
      .innerJoin(operators, eq(lots.operatorId, operators.id))
      .leftJoin(users, eq(bookings.driverId, users.id));

  return {
    async search(filter, limit) {
      const any: SQL[] = [];
      if (filter.code) any.push(eq(bookings.code, filter.code));
      if (filter.plateNorm) any.push(eq(bookings.plateNormSnapshot, filter.plateNorm));
      if (filter.phoneHash) any.push(eq(users.phoneHash, filter.phoneHash));
      if (filter.paymentId)
        any.push(
          inArray(
            bookings.id,
            db
              .select({ id: sql<string>`${payments.bookingId}` })
              .from(payments)
              .where(eq(payments.id, filter.paymentId)),
          ),
        );
      if (any.length === 0) return [];
      const rows = await base()
        .where(or(...any))
        .orderBy(desc(bookings.startAt))
        .limit(limit);
      return rows as SupportBookingRow[];
    },

    async find(bookingId) {
      const [row] = await base().where(eq(bookings.id, bookingId));
      return (row as SupportBookingRow | undefined) ?? null;
    },

    async history(bookingId) {
      const rows = await db
        .select({
          from: bookingStatusHistory.fromStatus,
          to: bookingStatusHistory.toStatus,
          actor: bookingStatusHistory.actorType,
          reason: bookingStatusHistory.reason,
          at: bookingStatusHistory.createdAt,
        })
        .from(bookingStatusHistory)
        .where(eq(bookingStatusHistory.bookingId, bookingId))
        .orderBy(asc(bookingStatusHistory.createdAt), asc(bookingStatusHistory.id));
      return rows;
    },
  };
}
