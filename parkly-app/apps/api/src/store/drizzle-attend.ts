import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { and, eq, gt, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { planEvent } from './attend-plan.js';
import type { AttendDeviceRow, AttendEventResult, Store } from './types.js';

const {
  devices,
  lots,
  users,
  bookings,
  bookingStatusHistory,
  sessions,
  checkinEvents,
  attendantSyncBatches,
  lotWalkIns,
  lotSigningKeys,
} = schema;

const deviceColumns = {
  id: devices.id,
  userId: devices.userId,
  clientDeviceId: devices.clientDeviceId,
  operatorId: devices.operatorId,
  lotId: devices.lotId,
  approvedAt: devices.approvedAt,
  revokedAt: devices.revokedAt,
  lastSeenAt: devices.lastSeenAt,
};

// operator_id and lot_id are set on every attendant row (the queries filter on them).
const asDevice = (
  r: Omit<AttendDeviceRow, 'operatorId' | 'lotId'> & {
    operatorId: string | null;
    lotId: string | null;
  },
): AttendDeviceRow => ({ ...r, operatorId: r.operatorId ?? '', lotId: r.lotId ?? '' });

const MANIFEST_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'NO_SHOW', 'COMPLETED', 'CANCELLED'] as const;

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

/** Sprint 5 parts of DrizzleStore: attendant phones, manifest and sync. */
export function drizzleAttend(db: Db): {
  attend: Store['attend'];
  forManifest: Store['lotKeys']['forManifest'];
} {
  return {
    attend: {
      async device(userId, clientDeviceId) {
        const [row] = await db
          .select(deviceColumns)
          .from(devices)
          .where(
            and(
              eq(devices.userId, userId),
              eq(devices.clientDeviceId, clientDeviceId),
              isNotNull(devices.lotId),
            ),
          );
        return row ? asDevice(row) : null;
      },

      async registerDevice(input) {
        // An approval is for one lot of one operator: registering the phone for
        // another lot starts unapproved unless a manager registers it (gap review G-3).
        const sameLot = sql`(${devices.lotId} is not distinct from ${input.lotId}::uuid and ${devices.operatorId} is not distinct from ${input.operatorId}::uuid)`;
        const kept = sql`case when ${sameLot} then ${devices.approvedAt} else null end`;
        const approvedAt = input.approve
          ? sql`case when ${devices.revokedAt} is null then coalesce(${kept}, ${input.at.toISOString()}::timestamptz) else ${kept} end`
          : kept;
        const [row] = await db
          .insert(devices)
          .values({
            id: uuidv7(),
            userId: input.userId,
            clientDeviceId: input.clientDeviceId,
            platform: 'PWA',
            operatorId: input.operatorId,
            lotId: input.lotId,
            lastSeenAt: input.at,
            approvedAt: input.approve ? input.at : null,
          })
          // Never clears revoked_at: a blocked phone stays blocked until a manager approves it.
          .onConflictDoUpdate({
            target: [devices.userId, devices.clientDeviceId],
            set: {
              operatorId: input.operatorId,
              lotId: input.lotId,
              lastSeenAt: input.at,
              approvedAt,
              approvedBy: sql`case when ${sameLot} then ${devices.approvedBy} else null end`,
            },
          })
          .returning(deviceColumns);
        if (!row) throw new Error('device not saved');
        return asDevice(row);
      },

      async operatorDevices(operatorId) {
        const rows = await db
          .select({ ...deviceColumns, lotName: lots.name, attendantName: users.firstName })
          .from(devices)
          .innerJoin(lots, eq(lots.id, devices.lotId))
          .innerJoin(users, eq(users.id, devices.userId))
          .where(eq(devices.operatorId, operatorId));
        return rows.map((r) => ({
          ...asDevice(r),
          lotName: r.lotName,
          attendantName: r.attendantName,
        }));
      },

      async decideDevice({ operatorId, deviceId, decision, by, at }) {
        const [row] = await db
          .update(devices)
          .set(
            decision === 'approve'
              ? { approvedAt: at, approvedBy: by, revokedAt: null }
              : { revokedAt: at },
          )
          .where(and(eq(devices.id, deviceId), eq(devices.operatorId, operatorId)))
          .returning(deviceColumns);
        return row ? asDevice(row) : null;
      },

      async manifest(lotId, from, to) {
        return db
          .select({
            id: bookings.id,
            code: bookings.code,
            plateNorm: bookings.plateNormSnapshot,
            startAt: bookings.startAt,
            endAt: bookings.endAt,
            status: bookings.status,
            checkedInAt: sessions.checkInAt,
            checkedOutAt: sessions.checkOutAt,
          })
          .from(bookings)
          .leftJoin(sessions, eq(sessions.bookingId, bookings.id))
          .where(
            and(
              eq(bookings.lotId, lotId),
              lt(bookings.startAt, to),
              gt(bookings.endAt, from),
              inArray(bookings.status, [...MANIFEST_STATUSES]),
            ),
          )
          .limit(5000);
      },

      async walkIns(lotId) {
        const [row] = await db
          .select({ count: lotWalkIns.count })
          .from(lotWalkIns)
          .where(eq(lotWalkIns.lotId, lotId));
        return row?.count ?? 0;
      },

      async applyBatch(batch, events) {
        const inserted = await db
          .insert(attendantSyncBatches)
          .values({
            id: batch.id,
            deviceId: batch.deviceId,
            lotId: batch.lotId,
            attendantId: batch.attendantId,
            eventCount: events.length,
            deviceSentAt: batch.deviceSentAt,
            serverReceivedAt: batch.receivedAt,
            clockOffsetMs: batch.receivedAt.getTime() - batch.deviceSentAt.getTime(),
          })
          .onConflictDoNothing()
          .returning({ id: attendantSyncBatches.id });
        const repeat = inserted.length === 0;
        const results: AttendEventResult[] = [];
        const checkedOut: string[] = [];

        for (const event of events) {
          const duplicate: AttendEventResult = {
            clientEventId: event.clientEventId,
            result: 'DUPLICATE',
            reason: 'ALREADY_SYNCED',
          };
          if (repeat) {
            results.push(duplicate);
            continue;
          }
          try {
            const r = await db.transaction(async (tx) => {
              const [seen] = await tx
                .select({ id: checkinEvents.id })
                .from(checkinEvents)
                .where(eq(checkinEvents.clientEventId, event.clientEventId));
              if (seen) return { ...duplicate, sessionOut: null };

              const bookingId = 'bookingId' in event ? event.bookingId : null;
              const [b] = bookingId
                ? await tx
                    .select({
                      id: bookings.id,
                      lotId: bookings.lotId,
                      status: bookings.status,
                      plateNorm: bookings.plateNormSnapshot,
                    })
                    .from(bookings)
                    .where(eq(bookings.id, bookingId))
                    .for('update')
                : [];
              const [s] = b
                ? await tx
                    .select({
                      id: sessions.id,
                      checkInAt: sessions.checkInAt,
                      checkOutAt: sessions.checkOutAt,
                      flags: sessions.flags,
                    })
                    .from(sessions)
                    .where(eq(sessions.bookingId, b.id))
                    .for('update')
                : [];
              const plan = planEvent({ event, batch, booking: b ?? null, session: s ?? null });
              let { result, reason } = plan;
              let sessionId: string | null = s?.id ?? null;
              let sessionOut: string | null = null;

              if (plan.walkInDelta)
                await tx
                  .insert(lotWalkIns)
                  .values({ lotId: batch.lotId, count: Math.max(0, plan.walkInDelta) })
                  .onConflictDoUpdate({
                    target: lotWalkIns.lotId,
                    set: { count: sql`greatest(0, ${lotWalkIns.count} + ${plan.walkInDelta})` },
                  });

              if (b && plan.session) {
                let flags = [...new Set([...(s?.flags ?? []), ...plan.session.addFlags])];
                let bookingTo = plan.booking;
                if (plan.booking && plan.rebookNoShow) {
                  const [ok] = await tx.execute<{ ok: boolean }>(
                    sql`select public.fn_rebook_no_show(${b.id}, ${plan.occurredAt.toISOString()}::timestamptz) as ok`,
                  );
                  if (!ok?.ok) {
                    // The car is inside anyway: record it, keep NO_SHOW, ops decide.
                    flags = [...new Set([...flags, 'NO_CAPACITY'])];
                    result = 'CONFLICT';
                    reason = 'NO_CAPACITY';
                    bookingTo = null;
                  }
                }
                const patch = {
                  ...(plan.session.checkInAt
                    ? {
                        checkInAt: plan.session.checkInAt,
                        checkInBy: batch.attendantId,
                        entryMethod: plan.session.method ?? null,
                      }
                    : {}),
                  ...(plan.session.checkOutAt
                    ? { checkOutAt: plan.session.checkOutAt, checkOutBy: batch.attendantId }
                    : {}),
                  flags,
                };
                if (s) {
                  await tx
                    .update(sessions)
                    .set({
                      ...patch,
                      version: sql`${sessions.version} + 1`,
                      updatedAt: batch.receivedAt,
                    })
                    .where(eq(sessions.id, s.id));
                } else {
                  sessionId = uuidv7();
                  await tx.insert(sessions).values({
                    id: sessionId,
                    bookingId: b.id,
                    lotId: b.lotId,
                    plateNorm: b.plateNorm,
                    ...patch,
                  });
                }
                if (plan.session.checkOutAt) sessionOut = sessionId;
                if (bookingTo) {
                  await tx
                    .update(bookings)
                    .set({
                      status: bookingTo.to,
                      version: sql`${bookings.version} + 1`,
                      updatedAt: batch.receivedAt,
                    })
                    .where(eq(bookings.id, b.id));
                  await tx.insert(bookingStatusHistory).values({
                    id: uuidv7(),
                    bookingId: b.id,
                    fromStatus: bookingTo.from,
                    toStatus: bookingTo.to,
                    actorType: 'ATTENDANT',
                    actorId: batch.attendantId,
                    reason: bookingTo.reason,
                  });
                }
              }

              await tx.insert(checkinEvents).values({
                id: uuidv7(),
                clientEventId: event.clientEventId,
                type: event.type,
                lotId: batch.lotId,
                bookingId: 'bookingId' in event ? event.bookingId : null,
                sessionId,
                method: 'method' in event ? event.method : null,
                plateSeen: event.type === 'CHECK_IN' ? event.plateSeen : null,
                delta: event.type === 'WALK_IN' ? event.delta : null,
                overrideReason: event.type === 'CHECK_IN' ? event.overrideReason : null,
                note: event.type === 'ISSUE' ? event.note : null,
                attendantId: batch.attendantId,
                deviceId: batch.deviceId,
                batchId: batch.id,
                deviceTime: event.deviceTime,
                occurredAt: plan.occurredAt,
                serverReceivedAt: batch.receivedAt,
                result,
                resultReason: reason,
              });
              return { clientEventId: event.clientEventId, result, reason, sessionOut };
            });
            results.push({ clientEventId: r.clientEventId, result: r.result, reason: r.reason });
            if (r.sessionOut) checkedOut.push(r.sessionOut);
          } catch (err) {
            // Another sync recorded the same event first.
            if (pgCode(err) === '23505') results.push(duplicate);
            else throw err;
          }
        }
        return { results, checkedOut };
      },

      async session(id) {
        const [row] = await db
          .select({
            id: sessions.id,
            bookingId: bookings.id,
            lotId: bookings.lotId,
            endAt: bookings.endAt,
            commissionBps: bookings.commissionBps,
            checkOutAt: sessions.checkOutAt,
          })
          .from(sessions)
          .innerJoin(bookings, eq(bookings.id, sessions.bookingId))
          .where(eq(sessions.id, id));
        return row ?? null;
      },

      async occupancy(lotIds, now) {
        const out = new Map<string, { parked: number; expected: number }>();
        for (const lotId of lotIds) out.set(lotId, { parked: 0, expected: 0 });
        if (lotIds.length === 0) return out;
        const parked = await db
          .select({ lotId: sessions.lotId, n: sql<number>`count(*)::int` })
          .from(sessions)
          .where(
            and(
              inArray(sessions.lotId, lotIds),
              isNotNull(sessions.checkInAt),
              isNull(sessions.checkOutAt),
            ),
          )
          .groupBy(sessions.lotId);
        const expected = await db
          .select({ lotId: bookings.lotId, n: sql<number>`count(*)::int` })
          .from(bookings)
          .leftJoin(sessions, eq(sessions.bookingId, bookings.id))
          .where(
            and(
              inArray(bookings.lotId, lotIds),
              inArray(bookings.status, ['CONFIRMED', 'NO_SHOW']),
              gt(bookings.endAt, now),
              lt(bookings.startAt, new Date(now.getTime() + 24 * 60 * 60_000)),
              isNull(sessions.checkInAt),
            ),
          )
          .groupBy(bookings.lotId);
        for (const r of parked) {
          const o = out.get(r.lotId);
          if (o) o.parked = r.n;
        }
        for (const r of expected) {
          const o = out.get(r.lotId);
          if (o) o.expected = r.n;
        }
        return out;
      },

      async sessionsForBookings(ids) {
        if (ids.length === 0) return new Map();
        const rows = await db
          .select({
            bookingId: sessions.bookingId,
            checkInAt: sessions.checkInAt,
            checkOutAt: sessions.checkOutAt,
            overstayMinutes: sessions.overstayMinutes,
            overstayAmountKobo: sessions.overstayAmountKobo,
            overstayStatus: sessions.overstayStatus,
          })
          .from(sessions)
          .where(inArray(sessions.bookingId, ids));
        return new Map(rows.map(({ bookingId, ...rest }) => [bookingId, rest]));
      },

      async setOverstay(sessionId, minutes, amountKobo) {
        await db
          .update(sessions)
          .set({
            overstayMinutes: minutes,
            overstayAmountKobo: amountKobo,
            overstayStatus: amountKobo > 0 ? 'DUE' : 'NONE',
          })
          // Paid or waived is final: a re-synced check-out must not reopen it (L-4).
          .where(
            and(
              eq(sessions.id, sessionId),
              notInArray(sessions.overstayStatus, ['PAID', 'WAIVED']),
            ),
          );
      },

      async sessionByBooking(bookingId) {
        const [row] = await db
          .select({
            id: sessions.id,
            bookingId: sessions.bookingId,
            lotId: sessions.lotId,
            overstayMinutes: sessions.overstayMinutes,
            overstayAmountKobo: sessions.overstayAmountKobo,
            overstayStatus: sessions.overstayStatus,
            checkInAt: sessions.checkInAt,
            checkOutAt: sessions.checkOutAt,
          })
          .from(sessions)
          .where(eq(sessions.bookingId, bookingId));
        return row ?? null;
      },

      async markOverstayPaid(bookingId) {
        await db.execute(sql`select public.fn_mark_overstay_paid(${bookingId}::uuid)`);
      },

      async unpaidOverstay(driverId) {
        const [row] = await db
          .select({
            bookingId: bookings.id,
            bookingCode: bookings.code,
            lotId: bookings.lotId,
            amountKobo: sessions.overstayAmountKobo,
          })
          .from(sessions)
          .innerJoin(bookings, eq(bookings.id, sessions.bookingId))
          .where(and(eq(bookings.driverId, driverId), eq(sessions.overstayStatus, 'UNPAID')))
          .limit(1);
        return row ?? null;
      },

      async waiveOverstay(bookingId) {
        const rows = await db
          .update(sessions)
          .set({ overstayStatus: 'WAIVED' })
          .where(
            and(
              eq(sessions.bookingId, bookingId),
              inArray(sessions.overstayStatus, ['DUE', 'UNPAID']),
            ),
          )
          .returning({ id: sessions.id });
        return rows.length > 0;
      },
    },

    async forManifest(lotId) {
      const rows = await db
        .select({
          id: lotSigningKeys.id,
          lotId: lotSigningKeys.lotId,
          kid: lotSigningKeys.kid,
          publicKey: lotSigningKeys.publicKey,
          privateKeyCiphertext: lotSigningKeys.privateKeyCiphertext,
          status: lotSigningKeys.status,
          activatedAt: lotSigningKeys.activatedAt,
        })
        .from(lotSigningKeys)
        .where(eq(lotSigningKeys.lotId, lotId));
      return {
        valid: rows.filter((k) => k.status !== 'REVOKED'),
        revokedKids: rows.filter((k) => k.status === 'REVOKED').map((k) => k.kid),
      };
    },
  };
}
