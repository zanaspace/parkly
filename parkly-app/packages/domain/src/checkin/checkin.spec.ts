import { describe, expect, it } from 'vitest';
import {
  correctClock,
  findByPlate,
  gateDecision,
  resolveCheckIn,
  resolveCheckOut,
  applyWalkIn,
  checkSelf,
  distanceM,
  gateCodeFor,
  attendantGateCodeFor,
  isAttendantGateCode,
  parseGateCode,
  type GateBooking,
} from './checkin.js';

const MIN = 60_000;
const START = new Date('2026-10-23T07:00:00Z'); // 08:00 Lagos
const END = new Date('2026-10-23T09:00:00Z');
const at = (minutesFromStart: number) => new Date(START.getTime() + minutesFromStart * MIN);
const rules = { earlyArrivalMin: 30, noShowGraceMin: 30 };

const booking = (over: Partial<GateBooking> = {}): GateBooking => ({
  id: 'b1',
  code: 'PK-7VBZNQ',
  plateNorm: 'LND123AB',
  startAt: START,
  endAt: END,
  status: 'CONFIRMED',
  checkedInAt: null,
  ...over,
});

describe('gate decision (doc 03 §3.3)', () => {
  const decide = (b: GateBooking | null, minutes: number, extra = {}) =>
    gateDecision({ booking: b, now: at(minutes), rules, ...extra });

  it('is green inside the window', () => {
    expect(decide(booking(), 0)).toMatchObject({
      colour: 'GREEN',
      reason: 'OK',
      plate: 'LND123AB',
    });
    expect(decide(booking(), -30)).toMatchObject({ colour: 'GREEN' });
  });

  it('asks for judgement when early, late or already in', () => {
    expect(decide(booking(), -31)).toMatchObject({ colour: 'AMBER', reason: 'EARLY' });
    expect(decide(booking(), 31)).toMatchObject({ colour: 'AMBER', reason: 'LATE' });
    expect(decide(booking({ status: 'NO_SHOW' }), 45)).toMatchObject({
      colour: 'AMBER',
      reason: 'LATE',
    });
    expect(decide(booking({ status: 'CHECKED_IN', checkedInAt: at(-5) }), 10)).toMatchObject({
      colour: 'AMBER',
      reason: 'ALREADY_IN',
      checkedInAt: at(-5),
    });
    // This device checked it in a moment ago, before the manifest knew.
    expect(decide(booking(), 10, { localCheckedInAt: at(2) })).toMatchObject({
      colour: 'AMBER',
      reason: 'ALREADY_IN',
      checkedInAt: at(2),
    });
  });

  it('refuses cancelled, finished or unknown bookings', () => {
    for (const status of ['CANCELLED', 'EXPIRED', 'PENDING_PAYMENT'] as const)
      expect(decide(booking({ status }), 0)).toMatchObject({ colour: 'RED', reason: 'CANCELLED' });
    expect(decide(booking({ status: 'COMPLETED' }), 0)).toMatchObject({
      colour: 'RED',
      reason: 'ENDED',
    });
    expect(decide(booking(), 120)).toMatchObject({ colour: 'RED', reason: 'ENDED' });
    expect(decide(null, 0)).toMatchObject({ colour: 'RED', reason: 'NOT_FOUND' });
  });

  it('accepts a valid QR the manifest does not know yet, as provisional', () => {
    const qr = { b: 'b9', p: 'KJA456CD', c: 'PK-ABCDEF', s: START, e: END };
    expect(decide(null, 0, { qr })).toMatchObject({
      colour: 'AMBER',
      reason: 'PROVISIONAL',
      bookingId: 'b9',
      plate: 'KJA456CD',
      code: 'PK-ABCDEF',
    });
    expect(decide(null, -45, { qr })).toMatchObject({ colour: 'AMBER', reason: 'EARLY' });
    expect(decide(null, 130, { qr })).toMatchObject({ colour: 'RED', reason: 'ENDED' });
  });

  it('says whether the attendant must give a reason', () => {
    expect(decide(booking(), 0).needsReason).toBe(false);
    expect(decide(booking(), -31).needsReason).toBe(true);
    expect(decide(null, 0).needsReason).toBe(false);
  });
});

describe('plate search (doc 03 §3.4)', () => {
  const list = [
    booking({ id: 'a', plateNorm: 'LND123AB' }),
    booking({ id: 'b', plateNorm: 'LND123AE' }),
    booking({ id: 'c', plateNorm: 'KJA456CD' }),
  ];

  it('finds exact matches first, then one-letter typos', () => {
    expect(findByPlate(list, 'lnd 123 ab').map((b) => b.id)).toEqual(['a']);
    expect(findByPlate(list, 'KJA456CO').map((b) => b.id)).toEqual(['c']);
    expect(
      findByPlate(list, 'LND123A')
        .map((b) => b.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(findByPlate(list, 'ABC999XY')).toEqual([]);
    expect(findByPlate(list, '')).toEqual([]);
  });
});

describe('clock correction (doc 03 §3.8)', () => {
  it('keeps the device time when it is within 10 minutes of the server', () => {
    const sent = new Date('2026-10-23T08:00:00Z');
    const received = new Date('2026-10-23T08:04:00Z');
    expect(
      correctClock({ occurredAt: at(0), deviceSentAt: sent, serverReceivedAt: received }),
    ).toEqual({
      occurredAt: at(0),
      skewed: false,
    });
  });

  it('shifts every event by the batch offset when the device clock is off', () => {
    const sent = new Date('2026-10-23T06:00:00Z'); // device two hours behind
    const received = new Date('2026-10-23T08:00:00Z');
    expect(
      correctClock({ occurredAt: at(0), deviceSentAt: sent, serverReceivedAt: received }),
    ).toEqual({
      occurredAt: at(120),
      skewed: true,
    });
  });
});

describe('sync rules (doc 01 §5.3, doc 03 §3.8)', () => {
  const received = at(60);

  it('applies the first check-in and keeps the earliest time', () => {
    expect(
      resolveCheckIn({ occurredAt: at(5), bookingStatus: 'CONFIRMED', session: null, received }),
    ).toEqual({ result: 'APPLIED', checkInAt: at(5), flags: [] });
    expect(
      resolveCheckIn({
        occurredAt: at(2),
        bookingStatus: 'CHECKED_IN',
        session: { checkInAt: at(5), checkOutAt: null },
        received,
      }),
    ).toEqual({ result: 'APPLIED', checkInAt: at(2), flags: [] });
    expect(
      resolveCheckIn({
        occurredAt: at(9),
        bookingStatus: 'CHECKED_IN',
        session: { checkInAt: at(5), checkOutAt: null },
        received,
      }),
    ).toEqual({ result: 'DUPLICATE', checkInAt: at(5), flags: [] });
  });

  it('still records a car that entered on a booking cancelled while offline', () => {
    expect(
      resolveCheckIn({ occurredAt: at(5), bookingStatus: 'CANCELLED', session: null, received }),
    ).toEqual({ result: 'CONFLICT', checkInAt: at(5), flags: ['ENTRY_AFTER_CANCEL'] });
  });

  it('rejects unknown bookings and events older than 48 hours', () => {
    expect(
      resolveCheckIn({ occurredAt: at(5), bookingStatus: null, session: null, received }),
    ).toEqual({ result: 'REJECTED', reason: 'UNKNOWN_BOOKING' });
    expect(
      resolveCheckIn({
        occurredAt: at(-49 * 60),
        bookingStatus: 'CONFIRMED',
        session: null,
        received,
      }),
    ).toEqual({ result: 'REJECTED', reason: 'TOO_OLD' });
  });

  it('keeps the latest check-out, and accepts one without a check-in', () => {
    expect(
      resolveCheckOut({
        occurredAt: at(130),
        session: { checkInAt: at(5), checkOutAt: null },
        received: at(140),
      }),
    ).toEqual({ result: 'APPLIED', checkOutAt: at(130), flags: [] });
    expect(
      resolveCheckOut({
        occurredAt: at(120),
        session: { checkInAt: at(5), checkOutAt: at(130) },
        received: at(140),
      }),
    ).toEqual({ result: 'DUPLICATE', checkOutAt: at(130), flags: [] });
    expect(
      resolveCheckOut({
        occurredAt: at(135),
        session: { checkInAt: at(5), checkOutAt: at(130) },
        received: at(140),
      }),
    ).toEqual({ result: 'APPLIED', checkOutAt: at(135), flags: [] });
    expect(resolveCheckOut({ occurredAt: at(130), session: null, received: at(140) })).toEqual({
      result: 'APPLIED',
      checkOutAt: at(130),
      flags: ['MISSING_CHECKIN'],
    });
    expect(resolveCheckOut({ occurredAt: at(-50 * 60), session: null, received: at(140) })).toEqual(
      { result: 'REJECTED', reason: 'TOO_OLD' },
    );
  });

  it('never lets the walk-in count go below zero', () => {
    expect(applyWalkIn(3, 1)).toEqual({ count: 4, clamped: false });
    expect(applyWalkIn(0, -1)).toEqual({ count: 0, clamped: true });
  });
});

describe('self check-in (ADR 0016)', () => {
  const LOT = '01a162b3-dcae-740c-a25a-e148a6951c2e';
  const lot = { lat: 6.4281, lng: 3.4219 };

  it('reads only Parkly entrance codes', () => {
    expect(gateCodeFor(LOT)).toBe(`PKG1.${LOT}`);
    expect(attendantGateCodeFor(LOT)).toBe(`PKGA.${LOT}`);
    expect(isAttendantGateCode(`PKGA.${LOT}`)).toBe(true);
    expect(isAttendantGateCode(`PKG1.${LOT}`)).toBe(false);
    expect(parseGateCode(`PKG1.${LOT}`)).toBe(LOT);
    expect(parseGateCode(` PKG1.${LOT.toUpperCase()} `)).toBe(LOT);
    expect(parseGateCode(`PKGA.${LOT}`)).toBe(LOT);
    expect(parseGateCode(` PKGA.${LOT.toUpperCase()} `)).toBe(LOT);
    expect(parseGateCode('PK1.abc.def.ghi')).toBeNull();
    expect(parseGateCode('PKG1.not-a-uuid')).toBeNull();
    expect(parseGateCode('PKGA.not-a-uuid')).toBeNull();
  });

  it('measures how far the phone is from the lot', () => {
    expect(distanceM(lot, lot)).toBe(0);
    // ~111 m per 0.001° of latitude.
    expect(Math.round(distanceM(lot, { lat: 6.4291, lng: 3.4219 }))).toBe(111);
  });

  it('allows it only at the lot, for that lot, inside the booking time', () => {
    const base = { lotId: LOT, lotLocation: lot, enabled: true, now: at(5), rules };
    const here = { code: `PKG1.${LOT}`, position: { lat: 6.4282, lng: 3.422 } };
    expect(checkSelf({ ...base, ...here, booking: booking() })).toEqual({ ok: true });
    expect(checkSelf({ ...base, ...here, enabled: false, booking: booking() })).toEqual({
      ok: false,
      code: 'SELF_CHECKIN_OFF',
    });
    // Scanning the attendant's phone barcode works even if unmanned self-checkin is disabled
    const attendantHere = { code: `PKGA.${LOT}`, position: { lat: 6.4282, lng: 3.422 } };
    expect(checkSelf({ ...base, ...attendantHere, enabled: false, booking: booking() })).toEqual({
      ok: true,
    });
    expect(
      checkSelf({
        ...base,
        ...here,
        code: 'PKG1.01a162b3-dcae-740c-a25a-e148a6951c2f',
        booking: booking(),
      }),
    ).toEqual({ ok: false, code: 'QR_WRONG_LOT' });
    expect(
      checkSelf({
        ...base,
        ...attendantHere,
        code: 'PKGA.01a162b3-dcae-740c-a25a-e148a6951c2f',
        booking: booking(),
      }),
    ).toEqual({ ok: false, code: 'QR_WRONG_LOT' });
    expect(
      checkSelf({ ...base, ...here, position: { lat: 6.44, lng: 3.4219 }, booking: booking() }),
    ).toEqual({ ok: false, code: 'TOO_FAR' });
    expect(checkSelf({ ...base, ...here, now: at(-45), booking: booking() })).toEqual({
      ok: false,
      code: 'QR_OUTSIDE_WINDOW',
    });
    expect(checkSelf({ ...base, ...here, booking: booking({ status: 'CANCELLED' }) })).toEqual({
      ok: false,
      code: 'BOOKING_NOT_ACTIVE',
    });
    // A late arrival (after the grace) may still check in before the end.
    expect(checkSelf({ ...base, ...here, now: at(60), booking: booking() })).toEqual({ ok: true });
  });
});
