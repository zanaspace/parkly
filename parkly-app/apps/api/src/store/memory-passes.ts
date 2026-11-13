import { checkCapacityBlock } from '@parkly/domain/availability';
import { confirmDecision } from '@parkly/domain/booking';
import {
  checkPassCapacity,
  checkPassCheckIn,
  checkPassVehicleSwap,
  passRenewalReminderDue,
} from '@parkly/domain/pass';
import { lagosDateKey, slotsInWindow } from '@parkly/domain/time';
import { randomUUID } from 'node:crypto';
import type { MemoryBookings } from './memory-bookings.js';
import {
  BookingCodeTakenError,
  CapacityBlockError,
  PassHoldError,
  PassSwapError,
  type CapacityBlockRow,
  type DriverVerificationRow,
  type LotRow,
  type PassRow,
  type PassWaitlistRow,
  type SlotRow,
  type Store,
  type UserRow,
} from './types.js';

export type PassSessionRow = {
  id: string;
  passId: string;
  lotId: string;
  plateNorm: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  checkInBy: string | null;
  checkOutBy: string | null;
  method: 'QR' | 'CODE' | 'PLATE' | 'SELF';
};

export class MemoryPasses {
  readonly driverVerificationRows: DriverVerificationRow[] = [];
  readonly blockRows: CapacityBlockRow[] = [];
  readonly passRows: PassRow[] = [];
  readonly waitlistRows: PassWaitlistRow[] = [];
  readonly passSessionRows: PassSessionRow[] = [];

  constructor(
    private readonly deps: {
      userRows: Map<string, UserRow>;
      lotRows: Map<string, LotRow>;
      slotRows: SlotRow[];
      bookings: MemoryBookings;
    },
  ) {}

  readonly driverVerifications: Store['driverVerifications'] = {
    record: async (row, at) => {
      const created: DriverVerificationRow = {
        ...row,
        id: randomUUID(),
        createdAt: at,
      };
      this.driverVerificationRows.push(created);
      if (row.status === 'VERIFIED') {
        const user = this.deps.userRows.get(row.userId);
        if (user) {
          user.isVerifiedDriver = true;
          user.verifiedAt = row.verifiedAt ?? at;
        }
      }
      return { ...created };
    },
    latest: async (userId) => {
      const r = this.driverVerificationRows
        .filter((x) => x.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return r ? { ...r } : null;
    },
  };

  readonly lotBlocks: Store['lotBlocks'] = {
    list: async (lotId) =>
      this.blockRows
        .filter((b) => b.lotId === lotId)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((b) => ({ ...b })),
    create: async (row, at) => {
      const lot = this.deps.lotRows.get(row.lotId);
      if (!lot) throw new CapacityBlockError('BOOKING_WINDOW_INVALID');

      const existingSlots = this.deps.slotRows.filter(
        (s) =>
          s.lotId === row.lotId &&
          s.slotStart.getTime() >= row.startsAt.getTime() &&
          s.slotStart.getTime() < row.endsAt.getTime(),
      );

      const check = checkCapacityBlock({
        startAt: row.startsAt,
        endAt: row.endsAt,
        blockedBays: row.blockedBays,
        capacityBookable: lot.capacityBookable,
        rows: existingSlots,
      });

      if (!check.ok) {
        if (check.reason === 'LOT_CAPACITY_BELOW_COMMITTED') {
          throw new CapacityBlockError('LOT_CAPACITY_BELOW_COMMITTED', check.conflictingSlotStart);
        }
        throw new CapacityBlockError('BOOKING_WINDOW_INVALID');
      }

      for (const slotStart of slotsInWindow(row.startsAt, row.endsAt)) {
        const slot = this.ensureSlot(row.lotId, slotStart, lot.capacityBookable);
        slot.blocked += row.blockedBays;
      }

      const created: CapacityBlockRow = {
        ...row,
        id: randomUUID(),
        createdAt: at,
      };
      this.blockRows.push(created);
      return { ...created };
    },
    remove: async (lotId, blockId) => {
      const idx = this.blockRows.findIndex((b) => b.id === blockId && b.lotId === lotId);
      if (idx < 0) return false;
      const [removed] = this.blockRows.splice(idx, 1);
      if (!removed) return false;

      for (const slotStart of slotsInWindow(removed.startsAt, removed.endsAt)) {
        const slot = this.deps.slotRows.find(
          (s) => s.lotId === lotId && s.slotStart.getTime() === slotStart.getTime(),
        );
        if (slot) {
          slot.blocked = Math.max(0, slot.blocked - removed.blockedBays);
        }
      }
      return true;
    },
  };

  readonly passes: Store['passes'] = {
    hold: async (input, pay, maxSharePercent, at) => {
      const lot = this.deps.lotRows.get(input.lotId);
      if (!lot || lot.status !== 'LIVE') throw new PassHoldError('LOT_NOT_BOOKABLE');

      if (
        this.passRows.some((p) => p.code === input.code) ||
        this.deps.bookings.bookingRows.some((b) => b.code === input.code)
      ) {
        throw new BookingCodeTakenError();
      }

      // Same vehicle cannot hold two overlapping passes at the same lot
      const hasVehicleOverlap = this.passRows.some(
        (p) =>
          p.lotId === input.lotId &&
          p.vehicleId === input.vehicleId &&
          (p.status === 'ACTIVE' || (p.status === 'HELD' && (p.holdExpiresAt ?? at) > at)) &&
          p.periodStart <= input.periodEnd &&
          p.periodEnd >= input.periodStart,
      );
      if (hasVehicleOverlap) throw new PassHoldError('PASS_OVERLAP');

      const overlappingPasses = this.passRows.filter(
        (p) =>
          p.lotId === input.lotId &&
          (p.status === 'ACTIVE' || (p.status === 'HELD' && (p.holdExpiresAt ?? at) > at)) &&
          p.periodStart <= input.periodEnd &&
          p.periodEnd >= input.periodStart,
      ).length;

      const slotsInPassWindow = this.deps.slotRows.filter(
        (s) =>
          s.lotId === input.lotId &&
          s.slotStart.getTime() >= input.startsAt.getTime() &&
          s.slotStart.getTime() < input.endsAt.getTime(),
      );
      const maxSlotCommitted = slotsInPassWindow.reduce(
        (max, s) => Math.max(max, s.booked + s.held + s.passReserved + s.blocked),
        0,
      );

      const capCheck = checkPassCapacity({
        capacityBookable: lot.capacityBookable,
        maxSharePercent,
        overlappingPasses,
        maxSlotCommitted,
      });
      if (!capCheck.ok) {
        throw new PassHoldError('PASS_CAPACITY_UNAVAILABLE');
      }

      for (const slotStart of slotsInWindow(input.startsAt, input.endsAt)) {
        const slot = this.ensureSlot(input.lotId, slotStart, lot.capacityBookable);
        slot.passReserved += 1;
      }

      const pass: PassRow = {
        ...input,
        status: 'HELD',
        totalKobo: input.priceKobo + input.serviceFeeKobo,
        swapsUsed: 0,
        lastReminderDays: null,
        createdAt: at,
      };
      const payment: (typeof this.deps.bookings.paymentRows)[number] = {
        ...pay,
        kind: 'PASS',
        bookingId: null,
        passId: pass.id,
        status: 'INITIATED',
        authorizationUrl: null,
        paidAt: null,
        failureCode: null,
        feesKobo: null,
        channel: null,
        cardLast4: null,
        cardBrand: null,
        accessCode: null,
        createdAt: at,
      };
      this.passRows.push(pass);
      this.deps.bookings.paymentRows.push(payment);
      return { pass: { ...pass }, payment: { ...payment } };
    },

    find: async (id) => {
      const p = this.passRows.find((r) => r.id === id);
      return p ? { ...p } : null;
    },

    findByCode: async (code) => {
      const p = this.passRows.find((r) => r.code === code);
      return p ? { ...p } : null;
    },

    paymentForPass: async (passId) => {
      const p = this.deps.bookings.paymentRows
        .filter((r) => r.passId === passId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return p ? { ...p } : null;
    },

    listForDriver: async (driverId, which, todayLagos, limit) => {
      const active = (p: PassRow) =>
        (p.status === 'ACTIVE' || p.status === 'HELD') && p.periodEnd >= todayLagos;
      return this.passRows
        .filter((p) => p.driverId === driverId && (which === 'active' ? active(p) : !active(p)))
        .sort((a, b) =>
          which === 'active'
            ? a.periodStart.localeCompare(b.periodStart)
            : b.periodEnd.localeCompare(a.periodEnd),
        )
        .slice(0, limit)
        .map((p) => ({ ...p }));
    },

    listActiveForLot: async (lotId, todayLagos) =>
      this.passRows
        .filter(
          (p) =>
            p.lotId === lotId &&
            p.status === 'ACTIVE' &&
            p.periodStart <= todayLagos &&
            p.periodEnd >= todayLagos,
        )
        .sort((a, b) => a.plateNorm.localeCompare(b.plateNorm))
        .map((p) => ({ ...p })),

    manifestForLot: async (lotId, now) => {
      const today = lagosDateKey(now);
      const active = this.passRows.filter(
        (p) =>
          p.lotId === lotId &&
          p.status === 'ACTIVE' &&
          p.periodStart <= today &&
          p.periodEnd >= today,
      );
      const out = [];
      for (const p of active) {
        const open = this.passSessionRows.find((s) => s.passId === p.id && s.checkOutAt === null);
        const user = this.deps.userRows.get(p.driverId);
        out.push({
          id: p.id,
          code: p.code,
          plateNorm: p.plateNorm,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          status: p.status,
          checkedInAt: open?.checkInAt ?? null,
          driverVerified: Boolean(user?.isVerifiedDriver),
        });
      }
      return out;
    },

    releaseHold: async (id, _reason, _at) => {
      const pass = this.passRows.find((p) => p.id === id);
      if (pass?.status !== 'HELD') return;
      for (const slotStart of slotsInWindow(pass.startsAt, pass.endsAt)) {
        const slot = this.deps.slotRows.find(
          (s) => s.lotId === pass.lotId && s.slotStart.getTime() === slotStart.getTime(),
        );
        if (slot) slot.passReserved = Math.max(0, slot.passReserved - 1);
      }
      pass.status = 'EXPIRED';
      pass.holdExpiresAt = null;
      for (const p of this.deps.bookings.paymentRows) {
        if (p.passId === id && p.status === 'INITIATED') {
          p.status = 'FAILED';
          p.failureCode = 'CHECKOUT_UNAVAILABLE';
        }
      }
    },

    settle: async (paymentId, charge, at) => {
      const payment = this.deps.bookings.paymentRows.find((p) => p.id === paymentId);
      if (!payment || !payment.passId) throw new Error(`no pass payment ${paymentId}`);
      const pass = this.passRows.find((p) => p.id === payment.passId);
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
        pass.status = 'ACTIVE';
        pass.holdExpiresAt = null;
        Object.assign(payment, {
          status: 'SUCCEEDED',
          paidAt: charge.paidAt ?? at,
          channel: charge.channel,
          cardLast4: charge.cardLast4,
          cardBrand: charge.cardBrand,
          feesKobo: charge.feesKobo,
        });
        const journalId = randomUUID();
        this.deps.bookings.ledgerRows.push(
          {
            journalId,
            account: `PROVIDER_CLEARING:${payment.provider}`,
            direction: 'DEBIT',
            amountKobo: payment.amountKobo,
            paymentId: payment.id,
            createdAt: at,
          },
          {
            journalId,
            account: `OPERATOR_PAYABLE:${payment.operatorId}`,
            direction: 'CREDIT',
            amountKobo: payment.operatorAmountKobo,
            paymentId: payment.id,
            createdAt: at,
          },
          ...(payment.platformAmountKobo > 0
            ? [
                {
                  journalId,
                  account: 'PLATFORM_REVENUE:COMMISSION' as const,
                  direction: 'CREDIT' as const,
                  amountKobo: payment.platformAmountKobo,
                  paymentId: payment.id,
                  createdAt: at,
                },
              ]
            : []),
        );
      } else if (decision === 'FAIL') {
        Object.assign(payment, { status: 'FAILED', failureCode: 'CHARGE_FAILED' });
      } else if (decision.startsWith('REFUND_')) {
        Object.assign(payment, {
          status: 'SUCCEEDED',
          paidAt: charge.paidAt ?? at,
          failureCode: decision,
        });
        const refund = {
          id: randomUUID(),
          paymentId: payment.id,
          amountKobo: charge.amountKobo,
          reason: (decision === 'REFUND_HOLD_EXPIRED' ? 'HOLD_EXPIRED' : 'OTHER') as
            'HOLD_EXPIRED' | 'OTHER',
          status: 'PENDING' as const,
          providerRefundId: null,
          requestedBy: null,
          approvedBy: null,
          note: decision,
          createdAt: at,
        };
        this.deps.bookings.refundRows.push(refund);
        return {
          decision,
          pass: { ...pass },
          payment: { ...payment },
          refund: { id: refund.id, amountKobo: refund.amountKobo },
        };
      }

      return { decision, pass: { ...pass }, payment: { ...payment }, refund: null };
    },

    swapVehicle: async (passId, vehicleId, plateNorm, todayLagos, _at) => {
      const pass = this.passRows.find((p) => p.id === passId);
      if (!pass) throw new PassSwapError('PASS_NOT_ACTIVE');

      const hasOpenSession = this.passSessionRows.some(
        (s) => s.passId === passId && s.checkOutAt === null,
      );

      const decision = checkPassVehicleSwap({
        status: pass.status,
        periodEnd: pass.periodEnd,
        todayLagos,
        swapsUsed: pass.swapsUsed,
        hasOpenSession,
        currentVehicleId: pass.vehicleId,
        newVehicleId: vehicleId,
      });

      if (!decision.ok) {
        throw new PassSwapError(decision.reason);
      }

      pass.vehicleId = vehicleId;
      pass.plateNorm = plateNorm;
      pass.swapsUsed = decision.swapsUsedAfter;
      return { ...pass };
    },

    joinWaitlist: async (row, at) => {
      const existing = this.waitlistRows.find(
        (w) =>
          w.lotId === row.lotId &&
          w.driverId === row.driverId &&
          w.status === 'WAITING' &&
          w.desiredStartDate === row.desiredStartDate,
      );
      if (existing) return { ...existing };
      const created: PassWaitlistRow = {
        ...row,
        id: randomUUID(),
        status: 'WAITING',
        notifiedAt: null,
        createdAt: at,
      };
      this.waitlistRows.push(created);
      return { ...created };
    },

    sessionForPass: async (passId) => {
      const open = this.passSessionRows.find((s) => s.passId === passId && s.checkOutAt === null);
      return {
        inLot: Boolean(open),
        checkedInAt: open?.checkInAt ?? null,
      };
    },

    sessionsForPasses: async (passIds) => {
      const out = new Map<string, { inLot: boolean; checkedInAt: Date | null }>();
      for (const id of passIds) {
        const open = this.passSessionRows.find((s) => s.passId === id && s.checkOutAt === null);
        out.set(id, { inLot: Boolean(open), checkedInAt: open?.checkInAt ?? null });
      }
      return out;
    },

    checkIn: async (passId, lotId, byUserId, method, todayLagos, at) => {
      const pass = this.passRows.find((p) => p.id === passId && p.lotId === lotId);
      if (!pass) return { result: 'REJECTED', reason: 'PASS_NOT_FOUND' };

      const hasOpenSession = this.passSessionRows.some(
        (s) => s.passId === passId && s.checkOutAt === null,
      );
      const check = checkPassCheckIn({
        status: pass.status,
        periodStart: pass.periodStart,
        periodEnd: pass.periodEnd,
        todayLagos,
        hasOpenSession,
        isLotOpen: true,
      });

      if (!check.ok) {
        if (check.reason === 'ALREADY_CHECKED_IN') {
          return { result: 'REJECTED', reason: 'ALREADY_IN_LOT' };
        }
        return { result: 'REJECTED', reason: check.reason };
      }

      this.passSessionRows.push({
        id: randomUUID(),
        passId,
        lotId,
        plateNorm: pass.plateNorm,
        checkInAt: at,
        checkOutAt: null,
        checkInBy: byUserId,
        checkOutBy: null,
        method,
      });
      return { result: 'APPLIED', reason: null };
    },

    checkOut: async (passId, lotId, byUserId, _method, at) => {
      const open = this.passSessionRows.find(
        (s) => s.passId === passId && s.lotId === lotId && s.checkOutAt === null,
      );
      if (!open) {
        return { result: 'CONFLICT', reason: 'NOT_CHECKED_IN' };
      }
      open.checkOutAt = at;
      open.checkOutBy = byUserId;
      return { result: 'APPLIED', reason: null };
    },

    dueForExpiryOrReminder: async (todayLagos, limit) => {
      return this.passRows
        .filter((p) => {
          if (p.status !== 'ACTIVE') return false;
          if (p.periodEnd < todayLagos) return true;
          return (
            passRenewalReminderDue({
              status: p.status,
              periodEnd: p.periodEnd,
              todayLagos,
              lastReminderDays: p.lastReminderDays,
            }) !== null
          );
        })
        .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((p) => ({ ...p }));
    },

    markReminded: async (id, days) => {
      const p = this.passRows.find((r) => r.id === id);
      if (p && (p.lastReminderDays === null || p.lastReminderDays > days)) {
        p.lastReminderDays = days;
      }
    },

    expire: async (id, _at) => {
      const p = this.passRows.find((r) => r.id === id);
      if (p?.status !== 'ACTIVE') return false;
      p.status = 'EXPIRED';
      return true;
    },
  };

  private ensureSlot(lotId: string, slotStart: Date, capacity: number): SlotRow {
    let row = this.deps.slotRows.find(
      (r) => r.lotId === lotId && r.slotStart.getTime() === slotStart.getTime(),
    );
    if (!row) {
      row = {
        lotId,
        slotStart,
        capacity,
        booked: 0,
        held: 0,
        passReserved: 0,
        blocked: 0,
      };
      this.deps.slotRows.push(row);
    }
    return row;
  }
}
