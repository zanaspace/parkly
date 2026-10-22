import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  checkBookingTransition,
  holdExpiresAt,
  isHoldExpired,
  type BookingActor,
  type BookingFacts,
  type BookingStatus,
} from './booking.js';

const START = new Date('2026-10-23T07:00:00Z'); // 08:00 Lagos
const END = new Date('2026-10-23T17:00:00Z');
const HOLD_END = new Date('2026-10-22T13:30:00Z');

const settings = { noShowGraceMin: 30, earlyArrivalMin: 30 };
const min = (n: number) => n * 60_000;

function facts(over: Partial<BookingFacts> = {}): BookingFacts {
  return {
    startAt: START,
    endAt: END,
    holdExpiresAt: HOLD_END,
    paymentSucceeded: true,
    amountMatches: true,
    lotMatches: true,
    capacityReacquired: true,
    ...over,
  };
}

const check = (
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActor,
  now: Date,
  over: Partial<BookingFacts> = {},
) => checkBookingTransition({ from, to, actor, now, facts: facts(over), settings });

describe('hold timing', () => {
  it('holds for the configured minutes', () => {
    expect(holdExpiresAt(new Date('2026-10-22T13:20:00Z'), 10)).toEqual(HOLD_END);
  });

  it('expires strictly after hold_expires_at', () => {
    expect(isHoldExpired(HOLD_END, HOLD_END)).toBe(false);
    expect(isHoldExpired(HOLD_END, new Date(HOLD_END.getTime() + 1))).toBe(true);
  });

  it('rejects a non-positive hold', () => {
    expect(() => holdExpiresAt(new Date(), 0)).toThrow(RangeError);
  });
});

describe('booking transitions (doc 02 §3.1)', () => {
  const beforeHoldEnd = new Date('2026-10-22T13:25:00Z');

  it('confirms only from SYSTEM with a succeeded, matching payment', () => {
    expect(check('PENDING_PAYMENT', 'CONFIRMED', 'SYSTEM', beforeHoldEnd)).toEqual({ ok: true });
    expect(check('PENDING_PAYMENT', 'CONFIRMED', 'DRIVER', beforeHoldEnd)).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(
      check('PENDING_PAYMENT', 'CONFIRMED', 'SYSTEM', beforeHoldEnd, { paymentSucceeded: false }),
    ).toEqual({ ok: false, code: 'PAYMENT_NOT_SUCCEEDED' });
    expect(
      check('PENDING_PAYMENT', 'CONFIRMED', 'SYSTEM', beforeHoldEnd, { amountMatches: false }),
    ).toEqual({ ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' });
  });

  it('expires a hold only after it has run out', () => {
    expect(check('PENDING_PAYMENT', 'EXPIRED', 'SYSTEM', beforeHoldEnd)).toEqual({
      ok: false,
      code: 'HOLD_NOT_EXPIRED',
    });
    expect(check('PENDING_PAYMENT', 'EXPIRED', 'SYSTEM', new Date('2026-10-22T13:31:00Z'))).toEqual(
      { ok: true },
    );
  });

  it('ends a hold early when the payment failed', () => {
    expect(
      check('PENDING_PAYMENT', 'EXPIRED', 'SYSTEM', beforeHoldEnd, { paymentFailed: true }),
    ).toEqual({ ok: true });
  });

  it('lets the driver cancel a pending booking', () => {
    expect(check('PENDING_PAYMENT', 'CANCELLED', 'DRIVER', beforeHoldEnd)).toEqual({ ok: true });
    expect(check('PENDING_PAYMENT', 'CANCELLED', 'ATTENDANT', beforeHoldEnd)).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('cancels a confirmed booking by the driver or an admin', () => {
    expect(check('CONFIRMED', 'CANCELLED', 'DRIVER', beforeHoldEnd)).toEqual({ ok: true });
    expect(check('CONFIRMED', 'CANCELLED', 'ADMIN', beforeHoldEnd)).toEqual({ ok: true });
    expect(check('CONFIRMED', 'CANCELLED', 'SYSTEM', beforeHoldEnd)).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('checks in from start − early arrival, at the right lot', () => {
    const early = new Date(START.getTime() - min(31));
    const onTime = new Date(START.getTime() - min(30));
    expect(check('CONFIRMED', 'CHECKED_IN', 'ATTENDANT', early)).toEqual({
      ok: false,
      code: 'TOO_EARLY_TO_CHECK_IN',
    });
    expect(check('CONFIRMED', 'CHECKED_IN', 'ATTENDANT', onTime)).toEqual({ ok: true });
    expect(check('CONFIRMED', 'CHECKED_IN', 'SYSTEM', onTime)).toEqual({ ok: true });
    expect(check('CONFIRMED', 'CHECKED_IN', 'ATTENDANT', onTime, { lotMatches: false })).toEqual({
      ok: false,
      code: 'QR_WRONG_LOT',
    });
    expect(check('CONFIRMED', 'CHECKED_IN', 'DRIVER', onTime)).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('marks a no-show only after start + grace', () => {
    const atGrace = new Date(START.getTime() + min(30));
    expect(check('CONFIRMED', 'NO_SHOW', 'SYSTEM', atGrace)).toEqual({
      ok: false,
      code: 'NO_SHOW_GRACE_NOT_OVER',
    });
    expect(check('CONFIRMED', 'NO_SHOW', 'SYSTEM', new Date(atGrace.getTime() + 1))).toEqual({
      ok: true,
    });
  });

  it('lets a late arrival check in before the end, with capacity back', () => {
    const late = new Date(START.getTime() + min(90));
    expect(check('NO_SHOW', 'CHECKED_IN', 'ATTENDANT', late)).toEqual({ ok: true });
    expect(check('NO_SHOW', 'CHECKED_IN', 'ATTENDANT', END)).toEqual({
      ok: false,
      code: 'BOOKING_WINDOW_OVER',
    });
    expect(
      check('NO_SHOW', 'CHECKED_IN', 'ATTENDANT', late, { capacityReacquired: false }),
    ).toEqual({ ok: false, code: 'BOOKING_SLOT_UNAVAILABLE' });
  });

  it('completes a checked-in booking', () => {
    expect(check('CHECKED_IN', 'COMPLETED', 'ATTENDANT', END)).toEqual({ ok: true });
    expect(check('CHECKED_IN', 'COMPLETED', 'SYSTEM', END)).toEqual({ ok: true });
  });

  it('rejects every transition not in the table with INVALID_STATE_TRANSITION', () => {
    const listed = new Set([
      'PENDING_PAYMENT>CONFIRMED',
      'PENDING_PAYMENT>EXPIRED',
      'PENDING_PAYMENT>CANCELLED',
      'CONFIRMED>CHECKED_IN',
      'CONFIRMED>CANCELLED',
      'CONFIRMED>NO_SHOW',
      'NO_SHOW>CHECKED_IN',
      'CHECKED_IN>COMPLETED',
    ]);
    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        if (listed.has(`${from}>${to}`)) continue;
        expect(check(from, to, 'SYSTEM', END), `${from} → ${to}`).toEqual({
          ok: false,
          code: 'INVALID_STATE_TRANSITION',
        });
      }
    }
  });
});
