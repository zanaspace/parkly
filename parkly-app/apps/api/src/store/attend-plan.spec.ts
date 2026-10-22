import { describe, expect, it } from 'vitest';
import { planEvent, type PlanBooking, type PlanSession } from './attend-plan.js';
import type { AttendBatch, AttendEventInput } from './types.js';

const T = (iso: string) => new Date(`2026-10-23T${iso}:00Z`);
const batch: AttendBatch = {
  id: 'batch',
  deviceId: 'device',
  lotId: 'lot',
  attendantId: 'att',
  deviceSentAt: T('08:00'),
  receivedAt: T('08:00'),
};
const booking = (over: Partial<PlanBooking> = {}): PlanBooking => ({
  id: 'b1',
  lotId: 'lot',
  status: 'CONFIRMED',
  plateNorm: 'LND123AB',
  ...over,
});
const checkIn = (over: Partial<Extract<AttendEventInput, { type: 'CHECK_IN' }>> = {}) =>
  ({
    type: 'CHECK_IN',
    clientEventId: 'e1',
    deviceTime: T('07:05'),
    bookingId: 'b1',
    method: 'QR',
    plateSeen: null,
    overrideReason: null,
    ...over,
  }) as const;
const checkOut = {
  type: 'CHECK_OUT',
  clientEventId: 'e2',
  deviceTime: T('09:30'),
  bookingId: 'b1',
  method: 'CODE',
} as const;
const inside: PlanSession = { id: 's1', checkInAt: T('07:05'), checkOutAt: null, flags: [] };

describe('event plan (doc 01 §5.3)', () => {
  it('opens the booking on check-in and notes a plate mismatch', () => {
    const plan = planEvent({
      event: checkIn({ plateSeen: 'kja 456 cd' }),
      batch,
      booking: booking(),
      session: null,
    });
    expect(plan).toMatchObject({
      result: 'APPLIED',
      session: { checkInAt: T('07:05'), addFlags: ['PLATE_MISMATCH'], method: 'QR' },
      booking: { from: 'CONFIRMED', to: 'CHECKED_IN', reason: 'checkin.qr' },
      rebookNoShow: false,
    });
  });

  it('asks to re-book a no-show and leaves other statuses alone', () => {
    expect(
      planEvent({
        event: checkIn(),
        batch,
        booking: booking({ status: 'NO_SHOW' }),
        session: null,
      }),
    ).toMatchObject({
      rebookNoShow: true,
      booking: { from: 'NO_SHOW', to: 'CHECKED_IN' },
    });
    expect(
      planEvent({
        event: checkIn(),
        batch,
        booking: booking({ status: 'CHECKED_IN' }),
        session: null,
      }).booking,
    ).toBeNull();
  });

  it('rejects another lot, unknown bookings and stale events', () => {
    expect(
      planEvent({ event: checkIn(), batch, booking: booking({ lotId: 'other' }), session: null }),
    ).toMatchObject({
      result: 'REJECTED',
      reason: 'WRONG_LOT',
    });
    expect(planEvent({ event: checkIn(), batch, booking: null, session: null }).reason).toBe(
      'UNKNOWN_BOOKING',
    );
    const old = checkIn({ deviceTime: new Date('2026-10-20T07:00:00Z') });
    expect(planEvent({ event: old, batch, booking: booking(), session: null }).reason).toBe(
      'TOO_OLD',
    );
    const oldOut = { ...checkOut, deviceTime: new Date('2026-10-20T07:00:00Z') };
    expect(planEvent({ event: oldOut, batch, booking: booking(), session: inside }).reason).toBe(
      'TOO_OLD',
    );
  });

  it('flags a device clock that was badly off', () => {
    const skewed = { ...batch, deviceSentAt: T('06:00') };
    const plan = planEvent({
      event: checkIn({ deviceTime: T('05:05') }),
      batch: skewed,
      booking: booking(),
      session: null,
    });
    expect(plan.occurredAt).toEqual(T('07:05'));
    expect(plan.session?.addFlags).toContain('CLOCK_SKEW');
  });

  it('ends the booking on check-out, once', () => {
    expect(
      planEvent({
        event: checkOut,
        batch,
        booking: booking({ status: 'CHECKED_IN' }),
        session: inside,
      }),
    ).toMatchObject({
      result: 'APPLIED',
      reason: null,
      session: { checkOutAt: T('09:30') },
      booking: { from: 'CHECKED_IN', to: 'COMPLETED' },
    });
    const done = { ...inside, checkOutAt: T('09:40') };
    expect(
      planEvent({
        event: checkOut,
        batch,
        booking: booking({ status: 'COMPLETED' }),
        session: done,
      }),
    ).toMatchObject({
      result: 'DUPLICATE',
      reason: 'ALREADY_CHECKED_OUT',
    });
  });

  it('accepts a check-out with no check-in and keeps cancelled bookings cancelled', () => {
    expect(planEvent({ event: checkOut, batch, booking: booking(), session: null })).toMatchObject({
      reason: 'MISSING_CHECKIN',
      session: { addFlags: ['MISSING_CHECKIN'] },
    });
    expect(
      planEvent({
        event: checkOut,
        batch,
        booking: booking({ status: 'CANCELLED' }),
        session: inside,
      }).booking,
    ).toBeNull();
  });

  it('only counts walk-ins and records issues', () => {
    const walk = {
      type: 'WALK_IN',
      clientEventId: 'w',
      deviceTime: T('07:10'),
      delta: -1,
    } as const;
    expect(planEvent({ event: walk, batch, booking: null, session: null })).toMatchObject({
      result: 'APPLIED',
      walkInDelta: -1,
    });
    const issue = {
      type: 'ISSUE',
      clientEventId: 'i',
      deviceTime: T('07:10'),
      note: 'Barrier stuck',
      bookingId: null,
    } as const;
    expect(planEvent({ event: issue, batch, booking: null, session: null })).toMatchObject({
      result: 'APPLIED',
      walkInDelta: null,
    });
  });
});
