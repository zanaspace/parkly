import type { BookingStatus } from '@parkly/domain/booking';
import { correctClock, resolveCheckIn, resolveCheckOut } from '@parkly/domain/checkin';
import { normalisePlate } from '@parkly/domain/plate';
import type { AttendBatch, AttendEventInput } from './types.js';

export type PlanBooking = {
  id: string;
  lotId: string;
  status: BookingStatus;
  plateNorm: string;
};
export type PlanSession = {
  id: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  flags: string[];
};

/** Everything one synced event changes; MemoryStore and DrizzleStore apply it as is. */
export type EventPlan = {
  result: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
  reason: string | null;
  occurredAt: Date;
  /** Create or update the booking's session. */
  session: {
    checkInAt?: Date;
    checkOutAt?: Date;
    addFlags: string[];
    method?: 'QR' | 'CODE' | 'PLATE' | 'SELF';
  } | null;
  booking: { from: BookingStatus; to: 'CHECKED_IN' | 'COMPLETED'; reason: string } | null;
  /** NO_SHOW → CHECKED_IN: take the remaining slots again (fn_rebook_no_show). */
  rebookNoShow: boolean;
  /** CHECKED_IN → COMPLETED or a late car: nothing to release, the booking simply ends. */
  walkInDelta: 1 | -1 | null;
};

const DEAD = new Set<BookingStatus>(['CANCELLED', 'EXPIRED', 'PENDING_PAYMENT']);

function nothing(result: EventPlan['result'], reason: string | null, occurredAt: Date): EventPlan {
  return {
    result,
    reason,
    occurredAt,
    session: null,
    booking: null,
    rebookNoShow: false,
    walkInDelta: null,
  };
}

/**
 * Doc 01 §5.3 / doc 03 §3.8 for one event: corrects the device clock, then
 * uses the domain rules (earliest check-in, latest check-out, cancelled-while-
 * offline still recorded, unknown or old events rejected).
 */
export function planEvent(input: {
  event: AttendEventInput;
  batch: AttendBatch;
  booking: PlanBooking | null;
  session: PlanSession | null;
}): EventPlan {
  const { event, batch, booking, session } = input;
  const clock = correctClock({
    occurredAt: event.deviceTime,
    deviceSentAt: batch.deviceSentAt,
    serverReceivedAt: batch.receivedAt,
  });
  const occurredAt = clock.occurredAt;
  const skew = clock.skewed ? ['CLOCK_SKEW'] : [];

  if (event.type === 'WALK_IN')
    return { ...nothing('APPLIED', null, occurredAt), walkInDelta: event.delta };
  if (event.type === 'ISSUE') return nothing('APPLIED', null, occurredAt);

  if (!booking) return nothing('REJECTED', 'UNKNOWN_BOOKING', occurredAt);
  if (booking.lotId !== batch.lotId) return nothing('REJECTED', 'WRONG_LOT', occurredAt);

  if (event.type === 'CHECK_IN') {
    const r = resolveCheckIn({
      occurredAt,
      bookingStatus: booking.status,
      session,
      received: batch.receivedAt,
    });
    if (r.result === 'REJECTED') return nothing('REJECTED', r.reason, occurredAt);
    if (r.result === 'DUPLICATE') return nothing('DUPLICATE', 'ALREADY_CHECKED_IN', occurredAt);
    const plate = event.plateSeen ? normalisePlate(event.plateSeen) : '';
    const flags = [
      ...r.flags,
      ...skew,
      ...(plate && plate !== booking.plateNorm ? ['PLATE_MISMATCH'] : []),
    ];
    const opens = booking.status === 'CONFIRMED' || booking.status === 'NO_SHOW';
    return {
      result: r.result,
      reason: r.result === 'CONFLICT' ? 'ENTRY_AFTER_CANCEL' : null,
      occurredAt,
      session: { checkInAt: r.checkInAt, addFlags: flags, method: event.method },
      booking: opens
        ? {
            from: booking.status,
            to: 'CHECKED_IN',
            reason: `checkin.${event.method.toLowerCase()}`,
          }
        : null,
      rebookNoShow: booking.status === 'NO_SHOW',
      walkInDelta: null,
    };
  }

  const r = resolveCheckOut({ occurredAt, session, received: batch.receivedAt });
  if (r.result === 'REJECTED') return nothing('REJECTED', r.reason, occurredAt);
  if (r.result === 'DUPLICATE') return nothing('DUPLICATE', 'ALREADY_CHECKED_OUT', occurredAt);
  const ends = !DEAD.has(booking.status) && booking.status !== 'COMPLETED';
  return {
    result: 'APPLIED',
    reason: r.flags.includes('MISSING_CHECKIN') ? 'MISSING_CHECKIN' : null,
    occurredAt,
    session: { checkOutAt: r.checkOutAt, addFlags: [...r.flags, ...skew] },
    booking: ends ? { from: booking.status, to: 'COMPLETED', reason: 'checkout' } : null,
    rebookNoShow: false,
    walkInDelta: null,
  };
}
