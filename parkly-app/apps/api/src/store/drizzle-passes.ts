import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { checkCapacityBlock } from '@parkly/domain/availability';
import { confirmDecision } from '@parkly/domain/booking';
import {
  checkPassCapacity,
  checkPassCheckIn,
  checkPassVehicleSwap,
  type PassStatus,
} from '@parkly/domain/pass';
import { lagosDateKey, slotsInWindow } from '@parkly/domain/time';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  BookingCodeTakenError,
  CapacityBlockError,
  PassHoldError,
  PassSwapError,
  type CapacityBlockRow,
  type DriverVerificationRow,
  type PassRow,
  type PassWaitlistRow,
  type PaymentRow,
  type Store,
} from './types.js';

const {
  users,
  lots,
  lotClosures,
  lotSlotInventory,
  driverVerifications,
  passes,
  passWaitlist,
  payments,
  refunds,
  ledgerAccounts,
  ledgerEntries,
  sessions,
} = schema;

const passColumns = {
  id: passes.id,
  code: passes.code,
  driverId: passes.driverId,
  vehicleId: passes.vehicleId,
  plateNorm: passes.plateNormSnapshot,
  lotId: passes.lotId,
  periodStart: passes.periodStart,
  periodEnd: passes.periodEnd,
  startsAt: passes.startsAt,
  endsAt: passes.endsAt,
  status: passes.status,
  holdExpiresAt: passes.holdExpiresAt,
  priceKobo: passes.priceKobo,
  serviceFeeKobo: passes.serviceFeeKobo,
  totalKobo: passes.totalKobo,
  commissionBps: passes.commissionBps,
  ratePlanId: passes.ratePlanId,
  pricingBreakdown: passes.pricingBreakdown,
  swapsUsed: passes.swapsUsed,
  lastReminderDays: passes.lastReminderDays,
  renewedFromPassId: passes.renewedFromPassId,
  source: passes.source,
  createdAt: passes.createdAt,
};

const paymentColumns = {
  id: payments.id,
  kind: payments.kind,
  bookingId: payments.bookingId,
  passId: payments.passId,
  payerUserId: payments.payerUserId,
  provider: payments.provider,
  status: payments.status,
  amountKobo: payments.amountKobo,
  platformAmountKobo: payments.platformAmountKobo,
  operatorAmountKobo: payments.operatorAmountKobo,
  operatorId: payments.operatorId,
  subaccountCode: payments.subaccountCode,
  authorizationUrl: payments.authorizationUrl,
  paidAt: payments.paidAt,
  failureCode: payments.failureCode,
  channel: payments.channel,
  cardLast4: payments.cardLast4,
  cardBrand: payments.cardBrand,
  feesKobo: payments.feesKobo,
  createdAt: payments.createdAt,
};

export function drizzlePasses(db: Db): Pick<Store, 'driverVerifications' | 'lotBlocks' | 'passes'> {
  return {
    driverVerifications: {
      async record(row, at) {
        return db.transaction(async (tx) => {
          const [created] = await tx
            .insert(driverVerifications)
            .values({
              id: uuidv7(),
              ...row,
              createdAt: at,
              updatedAt: at,
            })
            .returning();
          if (!created) throw new Error('driver_verifications insert failed');
          if (row.status === 'VERIFIED') {
            await tx
              .update(users)
              .set({ isVerifiedDriver: true, verifiedAt: row.verifiedAt ?? at })
              .where(eq(users.id, row.userId));
          }
          return created as DriverVerificationRow;
        });
      },
      async latest(userId) {
        const [row] = await db
          .select()
          .from(driverVerifications)
          .where(eq(driverVerifications.userId, userId))
          .orderBy(desc(driverVerifications.createdAt), desc(driverVerifications.id))
          .limit(1);
        return (row as DriverVerificationRow | undefined) ?? null;
      },
    },

    lotBlocks: {
      async list(lotId) {
        const rows = await db
          .select()
          .from(lotClosures)
          .where(eq(lotClosures.lotId, lotId))
          .orderBy(asc(lotClosures.startsAt), asc(lotClosures.id));
        return rows.map((r) => ({
          id: r.id,
          lotId: r.lotId,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          blockedBays: r.blockedBays,
          reason: r.reason ?? '',
          createdBy: r.createdBy,
          createdAt: r.createdAt,
        }));
      },

      async create(row, at) {
        return db.transaction(async (tx) => {
          const [lot] = await tx
            .select({ capacityBookable: lots.capacityBookable })
            .from(lots)
            .where(eq(lots.id, row.lotId))
            .for('update');
          if (!lot) throw new CapacityBlockError('BOOKING_WINDOW_INVALID');

          const existingSlots = await tx
            .select({
              slotStart: lotSlotInventory.slotStart,
              capacity: lotSlotInventory.capacity,
              booked: lotSlotInventory.booked,
              held: lotSlotInventory.held,
              passReserved: lotSlotInventory.passReserved,
              blocked: lotSlotInventory.blocked,
            })
            .from(lotSlotInventory)
            .where(
              and(
                eq(lotSlotInventory.lotId, row.lotId),
                gte(lotSlotInventory.slotStart, row.startsAt),
                sql`${lotSlotInventory.slotStart} < ${row.endsAt}`,
              ),
            )
            .for('update');

          const check = checkCapacityBlock({
            startAt: row.startsAt,
            endAt: row.endsAt,
            blockedBays: row.blockedBays,
            capacityBookable: lot.capacityBookable,
            rows: existingSlots,
          });
          if (!check.ok) {
            if (check.reason === 'LOT_CAPACITY_BELOW_COMMITTED') {
              throw new CapacityBlockError(
                'LOT_CAPACITY_BELOW_COMMITTED',
                check.conflictingSlotStart,
              );
            }
            throw new CapacityBlockError('BOOKING_WINDOW_INVALID');
          }

          for (const slotStart of slotsInWindow(row.startsAt, row.endsAt)) {
            await tx
              .insert(lotSlotInventory)
              .values({
                lotId: row.lotId,
                slotStart,
                capacity: lot.capacityBookable,
                booked: 0,
                held: 0,
                passReserved: 0,
                blocked: row.blockedBays,
              })
              .onConflictDoUpdate({
                target: [lotSlotInventory.lotId, lotSlotInventory.slotStart],
                set: {
                  blocked: sql`${lotSlotInventory.blocked} + ${row.blockedBays}`,
                },
              });
          }

          const [created] = await tx
            .insert(lotClosures)
            .values({
              id: uuidv7(),
              lotId: row.lotId,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              blockedBays: row.blockedBays,
              reason: row.reason,
              createdBy: row.createdBy,
              createdAt: at,
            })
            .returning();
          if (!created) throw new Error('lot_closures insert failed');
          return {
            id: created.id,
            lotId: created.lotId,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
            blockedBays: created.blockedBays,
            reason: created.reason ?? '',
            createdBy: created.createdBy,
            createdAt: created.createdAt,
          } satisfies CapacityBlockRow;
        });
      },

      async remove(lotId, blockId) {
        return db.transaction(async (tx) => {
          const [removed] = await tx
            .delete(lotClosures)
            .where(and(eq(lotClosures.id, blockId), eq(lotClosures.lotId, lotId)))
            .returning();
          if (!removed) return false;

          await tx
            .update(lotSlotInventory)
            .set({
              blocked: sql`greatest(0, ${lotSlotInventory.blocked} - ${removed.blockedBays})`,
            })
            .where(
              and(
                eq(lotSlotInventory.lotId, lotId),
                gte(lotSlotInventory.slotStart, removed.startsAt),
                sql`${lotSlotInventory.slotStart} < ${removed.endsAt}`,
              ),
            );
          return true;
        });
      },
    },

    passes: {
      async hold(input, pay, maxSharePercent, at) {
        return db.transaction(async (tx) => {
          const [lot] = await tx
            .select({ status: lots.status, capacityBookable: lots.capacityBookable })
            .from(lots)
            .where(eq(lots.id, input.lotId))
            .for('update');
          if (!lot || lot.status !== 'LIVE') throw new PassHoldError('LOT_NOT_BOOKABLE');

          const activeOrHeld = or(
            eq(passes.status, 'ACTIVE'),
            and(eq(passes.status, 'HELD'), sql`${passes.holdExpiresAt} > ${at}`),
          );

          const [overlap] = await tx
            .select({ id: passes.id })
            .from(passes)
            .where(
              and(
                eq(passes.lotId, input.lotId),
                eq(passes.vehicleId, input.vehicleId),
                activeOrHeld,
                lte(passes.periodStart, input.periodEnd),
                gte(passes.periodEnd, input.periodStart),
              ),
            )
            .limit(1);
          if (overlap) throw new PassHoldError('PASS_OVERLAP');

          const [countRow] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(passes)
            .where(
              and(
                eq(passes.lotId, input.lotId),
                activeOrHeld,
                lte(passes.periodStart, input.periodEnd),
                gte(passes.periodEnd, input.periodStart),
              ),
            );
          const overlappingPasses = countRow?.count ?? 0;

          const [slotPeak] = await tx
            .select({
              peak: sql<number>`coalesce(max(${lotSlotInventory.booked} + ${lotSlotInventory.held} + ${lotSlotInventory.passReserved} + ${lotSlotInventory.blocked}), 0)::int`,
            })
            .from(lotSlotInventory)
            .where(
              and(
                eq(lotSlotInventory.lotId, input.lotId),
                gte(lotSlotInventory.slotStart, input.startsAt),
                sql`${lotSlotInventory.slotStart} < ${input.endsAt}`,
              ),
            );

          const capCheck = checkPassCapacity({
            capacityBookable: lot.capacityBookable,
            maxSharePercent,
            overlappingPasses,
            maxSlotCommitted: slotPeak?.peak ?? 0,
          });
          if (!capCheck.ok) {
            throw new PassHoldError('PASS_CAPACITY_UNAVAILABLE');
          }

          for (const slotStart of slotsInWindow(input.startsAt, input.endsAt)) {
            await tx
              .insert(lotSlotInventory)
              .values({
                lotId: input.lotId,
                slotStart,
                capacity: lot.capacityBookable,
                booked: 0,
                held: 0,
                passReserved: 1,
                blocked: 0,
              })
              .onConflictDoUpdate({
                target: [lotSlotInventory.lotId, lotSlotInventory.slotStart],
                set: {
                  passReserved: sql`${lotSlotInventory.passReserved} + 1`,
                },
              });
          }

          let createdPass: PassRow | undefined;
          try {
            const [row] = await tx
              .insert(passes)
              .values({
                id: input.id,
                code: input.code,
                driverId: input.driverId,
                vehicleId: input.vehicleId,
                plateNormSnapshot: input.plateNorm,
                lotId: input.lotId,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                startsAt: input.startsAt,
                endsAt: input.endsAt,
                status: 'HELD',
                holdExpiresAt: input.holdExpiresAt,
                priceKobo: input.priceKobo,
                serviceFeeKobo: input.serviceFeeKobo,
                totalKobo: input.priceKobo + input.serviceFeeKobo,
                commissionBps: input.commissionBps,
                ratePlanId: input.ratePlanId,
                pricingBreakdown: input.pricingBreakdown,
                renewedFromPassId: input.renewedFromPassId,
                source: input.source,
                createdAt: at,
                updatedAt: at,
              })
              .returning(passColumns);
            createdPass = row as PassRow | undefined;
          } catch (err) {
            const e = err as { code?: string; cause?: { code?: string } };
            if ((e.code ?? e.cause?.code) === '23505') throw new BookingCodeTakenError();
            throw err;
          }
          if (!createdPass) throw new Error('pass insert failed');

          const [createdPayment] = await tx
            .insert(payments)
            .values({
              id: pay.id,
              kind: 'PASS',
              bookingId: null,
              passId: createdPass.id,
              payerUserId: pay.payerUserId,
              provider: pay.provider,
              providerReference: pay.id,
              amountKobo: pay.amountKobo,
              platformAmountKobo: pay.platformAmountKobo,
              operatorAmountKobo: pay.operatorAmountKobo,
              operatorId: pay.operatorId,
              subaccountCode: pay.subaccountCode,
              status: 'INITIATED',
              createdAt: at,
              updatedAt: at,
            })
            .returning(paymentColumns);
          if (!createdPayment) throw new Error('pass payment insert failed');

          return { pass: createdPass, payment: createdPayment as PaymentRow };
        });
      },

      async find(id) {
        const [row] = await db.select(passColumns).from(passes).where(eq(passes.id, id));
        return (row as PassRow | undefined) ?? null;
      },

      async findByCode(code) {
        const [row] = await db.select(passColumns).from(passes).where(eq(passes.code, code));
        return (row as PassRow | undefined) ?? null;
      },

      async paymentForPass(passId) {
        const [row] = await db
          .select(paymentColumns)
          .from(payments)
          .where(eq(payments.passId, passId))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        return (row as PaymentRow | undefined) ?? null;
      },

      async listForDriver(driverId, which, todayLagos, limit) {
        const isActive = and(
          inArray(passes.status, ['ACTIVE', 'HELD']),
          gte(passes.periodEnd, todayLagos),
        );
        const rows = await db
          .select(passColumns)
          .from(passes)
          .where(
            and(
              eq(passes.driverId, driverId),
              which === 'active'
                ? isActive
                : or(
                    inArray(passes.status, ['EXPIRED', 'CANCELLED', 'REVOKED']),
                    sql`${passes.periodEnd} < ${todayLagos}::date`,
                  ),
            ),
          )
          .orderBy(
            which === 'active' ? asc(passes.periodStart) : desc(passes.periodEnd),
            desc(passes.id),
          )
          .limit(limit);
        return rows as PassRow[];
      },

      async listActiveForLot(lotId, todayLagos) {
        const rows = await db
          .select(passColumns)
          .from(passes)
          .where(
            and(
              eq(passes.lotId, lotId),
              eq(passes.status, 'ACTIVE'),
              lte(passes.periodStart, todayLagos),
              gte(passes.periodEnd, todayLagos),
            ),
          )
          .orderBy(asc(passes.plateNormSnapshot));
        return rows as PassRow[];
      },

      async manifestForLot(lotId, now) {
        const today = lagosDateKey(now);
        const rows = await db
          .select({
            id: passes.id,
            code: passes.code,
            plateNorm: passes.plateNormSnapshot,
            periodStart: passes.periodStart,
            periodEnd: passes.periodEnd,
            status: passes.status,
            checkedInAt: sessions.checkInAt,
            driverVerified: users.isVerifiedDriver,
          })
          .from(passes)
          .leftJoin(sessions, and(eq(sessions.passId, passes.id), isNull(sessions.checkOutAt)))
          .leftJoin(users, eq(users.id, passes.driverId))
          .where(
            and(
              eq(passes.lotId, lotId),
              eq(passes.status, 'ACTIVE'),
              lte(passes.periodStart, today),
              gte(passes.periodEnd, today),
            ),
          );
        return rows.map((r) => ({
          id: r.id,
          code: r.code,
          plateNorm: r.plateNorm,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          status: r.status as PassStatus,
          checkedInAt: r.checkedInAt ?? null,
          driverVerified: Boolean(r.driverVerified),
        }));
      },

      async releaseHold(id, _reason, at) {
        await db.transaction(async (tx) => {
          const [pass] = await tx
            .update(passes)
            .set({ status: 'EXPIRED', holdExpiresAt: null, updatedAt: at })
            .where(and(eq(passes.id, id), eq(passes.status, 'HELD')))
            .returning(passColumns);
          if (!pass) return;

          await tx
            .update(lotSlotInventory)
            .set({
              passReserved: sql`greatest(0, ${lotSlotInventory.passReserved} - 1)`,
            })
            .where(
              and(
                eq(lotSlotInventory.lotId, pass.lotId),
                gte(lotSlotInventory.slotStart, pass.startsAt),
                sql`${lotSlotInventory.slotStart} < ${pass.endsAt}`,
              ),
            );

          await tx
            .update(payments)
            .set({ status: 'FAILED', failureCode: 'CHECKOUT_UNAVAILABLE', updatedAt: at })
            .where(and(eq(payments.passId, id), eq(payments.status, 'INITIATED')));
        });
      },

      async settle(paymentId, charge, at) {
        return db.transaction(async (tx) => {
          const [payment] = await tx
            .select(paymentColumns)
            .from(payments)
            .where(eq(payments.id, paymentId))
            .for('update');
          if (!payment || !payment.passId) throw new Error(`no pass payment ${paymentId}`);

          const [pass] = await tx
            .select(passColumns)
            .from(passes)
            .where(eq(passes.id, payment.passId))
            .for('update');
          if (!pass) throw new Error(`no pass ${payment.passId}`);

          const mappedBookingStatus =
            pass.status === 'HELD'
              ? 'PENDING_PAYMENT'
              : pass.status === 'ACTIVE'
                ? 'CONFIRMED'
                : pass.status === 'CANCELLED'
                  ? 'CANCELLED'
                  : 'EXPIRED';

          const decision = confirmDecision({
            payment: { status: payment.status, amountKobo: payment.amountKobo },
            verify: charge,
            bookingStatus: mappedBookingStatus,
            capacityAvailable: true,
          });

          if (decision === 'CONFIRM') {
            const [updatedPass] = await tx
              .update(passes)
              .set({ status: 'ACTIVE', holdExpiresAt: null, updatedAt: at })
              .where(eq(passes.id, pass.id))
              .returning(passColumns);
            const [updatedPayment] = await tx
              .update(payments)
              .set({
                status: 'SUCCEEDED',
                paidAt: charge.paidAt ?? at,
                channel: charge.channel,
                cardLast4: charge.cardLast4,
                cardBrand: charge.cardBrand,
                feesKobo: charge.feesKobo,
                updatedAt: at,
              })
              .where(eq(payments.id, payment.id))
              .returning(paymentColumns);

            const clearingCode = `PROVIDER_CLEARING:${payment.provider}`;
            const payableCode = `OPERATOR_PAYABLE:${payment.operatorId}`;
            const revCode = 'PLATFORM_REVENUE:COMMISSION';

            await tx
              .insert(ledgerAccounts)
              .values([
                { id: uuidv7(), code: clearingCode, type: 'ASSET' as const },
                {
                  id: uuidv7(),
                  code: payableCode,
                  type: 'LIABILITY' as const,
                  operatorId: payment.operatorId,
                },
                { id: uuidv7(), code: revCode, type: 'REVENUE' as const },
              ])
              .onConflictDoNothing({ target: ledgerAccounts.code });

            const accounts = await tx
              .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
              .from(ledgerAccounts)
              .where(inArray(ledgerAccounts.code, [clearingCode, payableCode, revCode]));
            const byCode = new Map(accounts.map((a) => [a.code, a.id]));
            const clearingId = byCode.get(clearingCode);
            const payableId = byCode.get(payableCode);
            const revId = byCode.get(revCode);
            if (!clearingId || !payableId) {
              throw new Error('ledger accounts missing');
            }
            const journalId = uuidv7();

            await tx.insert(ledgerEntries).values([
              {
                id: uuidv7(),
                journalId,
                accountId: clearingId,
                direction: 'DEBIT',
                amountKobo: payment.amountKobo,
                paymentId: payment.id,
                description: `Pass ${pass.code}`,
                createdAt: at,
              },
              {
                id: uuidv7(),
                journalId,
                accountId: payableId,
                direction: 'CREDIT',
                amountKobo: payment.operatorAmountKobo,
                paymentId: payment.id,
                description: `Pass ${pass.code}`,
                createdAt: at,
              },
              ...(payment.platformAmountKobo > 0 && revId
                ? [
                    {
                      id: uuidv7(),
                      journalId,
                      accountId: revId,
                      direction: 'CREDIT' as const,
                      amountKobo: payment.platformAmountKobo,
                      paymentId: payment.id,
                      description: `Pass ${pass.code} commission`,
                      createdAt: at,
                    },
                  ]
                : []),
            ]);

            return {
              decision,
              pass: (updatedPass ?? pass) as PassRow,
              payment: (updatedPayment ?? payment) as PaymentRow,
              refund: null,
            };
          }

          if (decision === 'FAIL') {
            const [updatedPayment] = await tx
              .update(payments)
              .set({ status: 'FAILED', failureCode: charge.status, updatedAt: at })
              .where(eq(payments.id, payment.id))
              .returning(paymentColumns);
            return {
              decision,
              pass: pass as PassRow,
              payment: (updatedPayment ?? payment) as PaymentRow,
              refund: null,
            };
          }

          if (decision === 'REFUND_HOLD_EXPIRED' || decision === 'REFUND_CANCELLED') {
            const [updatedPayment] = await tx
              .update(payments)
              .set({
                status: 'SUCCEEDED',
                paidAt: charge.paidAt ?? at,
                failureCode: decision,
                updatedAt: at,
              })
              .where(eq(payments.id, payment.id))
              .returning(paymentColumns);
            const refundId = uuidv7();
            await tx.insert(refunds).values({
              id: refundId,
              paymentId: payment.id,
              amountKobo: charge.amountKobo,
              reason: decision === 'REFUND_HOLD_EXPIRED' ? 'HOLD_EXPIRED' : 'OTHER',
              status: 'PENDING',
              note: decision,
              createdAt: at,
              updatedAt: at,
            });
            return {
              decision,
              pass: pass as PassRow,
              payment: (updatedPayment ?? payment) as PaymentRow,
              refund: { id: refundId, amountKobo: charge.amountKobo },
            };
          }

          return {
            decision,
            pass: pass as PassRow,
            payment: payment as PaymentRow,
            refund: null,
          };
        });
      },

      async swapVehicle(passId, vehicleId, plateNorm, todayLagos, at) {
        return db.transaction(async (tx) => {
          const [pass] = await tx
            .select(passColumns)
            .from(passes)
            .where(eq(passes.id, passId))
            .for('update');
          if (!pass) throw new PassSwapError('PASS_NOT_ACTIVE');

          const [openSession] = await tx
            .select({ id: sessions.id })
            .from(sessions)
            .where(and(eq(sessions.passId, passId), isNull(sessions.checkOutAt)))
            .limit(1);

          const decision = checkPassVehicleSwap({
            status: pass.status,
            periodEnd: pass.periodEnd,
            todayLagos,
            swapsUsed: pass.swapsUsed,
            hasOpenSession: Boolean(openSession),
            currentVehicleId: pass.vehicleId,
            newVehicleId: vehicleId,
          });
          if (!decision.ok) throw new PassSwapError(decision.reason);

          const [updated] = await tx
            .update(passes)
            .set({
              vehicleId,
              plateNormSnapshot: plateNorm,
              swapsUsed: decision.swapsUsedAfter,
              updatedAt: at,
            })
            .where(eq(passes.id, passId))
            .returning(passColumns);
          return (updated ?? pass) as PassRow;
        });
      },

      async joinWaitlist(row, at) {
        const [existing] = await db
          .select()
          .from(passWaitlist)
          .where(
            and(
              eq(passWaitlist.lotId, row.lotId),
              eq(passWaitlist.driverId, row.driverId),
              eq(passWaitlist.status, 'WAITING'),
              eq(passWaitlist.desiredStartDate, row.desiredStartDate),
            ),
          )
          .limit(1);
        if (existing) return existing as PassWaitlistRow;

        const [created] = await db
          .insert(passWaitlist)
          .values({
            id: uuidv7(),
            lotId: row.lotId,
            driverId: row.driverId,
            desiredStartDate: row.desiredStartDate,
            status: 'WAITING',
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        if (!created) throw new Error('pass_waitlist insert failed');
        return created as PassWaitlistRow;
      },

      async sessionForPass(passId) {
        const [open] = await db
          .select({ checkInAt: sessions.checkInAt })
          .from(sessions)
          .where(and(eq(sessions.passId, passId), isNull(sessions.checkOutAt)))
          .limit(1);
        return {
          inLot: Boolean(open),
          checkedInAt: open?.checkInAt ?? null,
        };
      },

      async sessionsForPasses(passIds) {
        const out = new Map<string, { inLot: boolean; checkedInAt: Date | null }>();
        if (passIds.length === 0) return out;
        const rows = await db
          .select({ passId: sessions.passId, checkInAt: sessions.checkInAt })
          .from(sessions)
          .where(and(inArray(sessions.passId, passIds), isNull(sessions.checkOutAt)));
        for (const id of passIds) out.set(id, { inLot: false, checkedInAt: null });
        for (const r of rows) {
          if (r.passId) out.set(r.passId, { inLot: true, checkedInAt: r.checkInAt });
        }
        return out;
      },

      async checkIn(passId, lotId, byUserId, method, todayLagos, at) {
        return db.transaction(async (tx) => {
          const [pass] = await tx
            .select(passColumns)
            .from(passes)
            .where(and(eq(passes.id, passId), eq(passes.lotId, lotId)))
            .for('update');
          if (!pass) return { result: 'REJECTED', reason: 'PASS_NOT_FOUND' };

          const [open] = await tx
            .select({ id: sessions.id })
            .from(sessions)
            .where(and(eq(sessions.passId, passId), isNull(sessions.checkOutAt)))
            .limit(1);

          const check = checkPassCheckIn({
            status: pass.status,
            periodStart: pass.periodStart,
            periodEnd: pass.periodEnd,
            todayLagos,
            hasOpenSession: Boolean(open),
            isLotOpen: true,
          });
          if (!check.ok) {
            if (check.reason === 'ALREADY_CHECKED_IN') {
              return { result: 'CONFLICT', reason: 'ALREADY_CHECKED_IN' };
            }
            return { result: 'REJECTED', reason: check.reason };
          }

          await tx.insert(sessions).values({
            id: uuidv7(),
            bookingId: null,
            passId,
            lotId,
            plateNorm: pass.plateNorm,
            checkInAt: at,
            checkInBy: byUserId,
            entryMethod: method,
            createdAt: at,
            updatedAt: at,
          });
          return { result: 'APPLIED', reason: null };
        });
      },

      async checkOut(passId, lotId, byUserId, _method, at) {
        const updated = await db
          .update(sessions)
          .set({ checkOutAt: at, checkOutBy: byUserId, updatedAt: at })
          .where(
            and(
              eq(sessions.passId, passId),
              eq(sessions.lotId, lotId),
              isNull(sessions.checkOutAt),
            ),
          )
          .returning({ id: sessions.id });
        if (updated.length === 0) {
          return { result: 'CONFLICT', reason: 'NOT_CHECKED_IN' };
        }
        return { result: 'APPLIED', reason: null };
      },

      async dueForExpiryOrReminder(todayLagos, limit) {
        const daysLeft = sql`(${passes.periodEnd} - ${todayLagos}::date)`;
        const rows = await db
          .select(passColumns)
          .from(passes)
          .where(
            and(
              eq(passes.status, 'ACTIVE'),
              sql`${daysLeft} <= 7`,
              or(
                sql`${daysLeft} < 0`,
                and(
                  sql`${daysLeft} = 7`,
                  or(isNull(passes.lastReminderDays), sql`${passes.lastReminderDays} > 7`),
                ),
                and(
                  sql`${daysLeft} = 2`,
                  or(isNull(passes.lastReminderDays), sql`${passes.lastReminderDays} > 2`),
                ),
              ),
            ),
          )
          .orderBy(asc(passes.periodEnd), asc(passes.id))
          .limit(limit);
        return rows as PassRow[];
      },

      async markReminded(id, days) {
        await db
          .update(passes)
          .set({ lastReminderDays: days })
          .where(
            and(
              eq(passes.id, id),
              or(isNull(passes.lastReminderDays), sql`${passes.lastReminderDays} > ${days}`),
            ),
          );
      },

      async expire(id, at) {
        const rows = await db
          .update(passes)
          .set({ status: 'EXPIRED', updatedAt: at })
          .where(and(eq(passes.id, id), eq(passes.status, 'ACTIVE')))
          .returning({ id: passes.id });
        return rows.length > 0;
      },
    },
  };
}
