import type { Booking } from '@parkly/contracts';
import { describe, expect, it } from 'vitest';
import { checkInNotYet, outsideWindowMessage, positionProblem, selfCheckKind } from './self-check';

const b = (over: Partial<Booking>, selfCheckIn = true) =>
  ({ status: 'CONFIRMED', stay: null, ...over, lot: { selfCheckIn } }) as unknown as Booking;

describe('selfCheckKind (ADR 0016)', () => {
  it('offers check-in, then check-out for confirmed and active stays', () => {
    expect(selfCheckKind(b({}))).toBe('in');
    expect(selfCheckKind(b({}, false))).toBe('in');
    const stay = { checkedInAt: 'x', checkedOutAt: null, overstayMinutes: 0, overstayKobo: 0 };
    expect(selfCheckKind(b({ status: 'CHECKED_IN', stay }))).toBe('out');
    expect(
      selfCheckKind(b({ status: 'COMPLETED', stay: { ...stay, checkedOutAt: 'y' } })),
    ).toBeNull();
    expect(selfCheckKind(b({ status: 'CANCELLED' }))).toBeNull();
  });
});

describe('positionProblem (gap review G-1)', () => {
  it('refuses fake locations and rough fixes', () => {
    expect(positionProblem({ coords: { accuracy: 20 } })).toBeNull();
    expect(positionProblem({ mocked: true, coords: { accuracy: 5 } })).toMatch(/fake-location/);
    expect(positionProblem({ coords: { accuracy: 400 } })).toMatch(/precise/);
    expect(positionProblem({ coords: { accuracy: null } })).toMatch(/precise/);
  });
});

describe('check-in timing (ADR 0023)', () => {
  // A 12:00–14:00 Lagos booking; check-in opens at 11:30.
  const timed = b({
    startAt: '2026-11-06T11:00:00.000Z',
    endAt: '2026-11-06T13:00:00.000Z',
    checkInOpensAt: '2026-11-06T10:30:00.000Z',
  });

  it('says when check-in opens while it is too early', () => {
    expect(checkInNotYet(timed, Date.parse('2026-11-06T10:11:00Z'))).toBe(
      'Check-in opens at 11:30 (30 minutes before your booking).',
    );
  });

  it('offers check-in from the opening time, and when the API gave no time', () => {
    expect(checkInNotYet(timed, Date.parse('2026-11-06T10:30:00Z'))).toBeNull();
    expect(
      checkInNotYet(b({ checkInOpensAt: null }), Date.parse('2026-11-06T10:11:00Z')),
    ).toBeNull();
  });

  it('explains a refused check-in: early with the time, or the booking has ended', () => {
    expect(outsideWindowMessage(timed, Date.parse('2026-11-06T10:11:00Z'))).toBe(
      'You’re early. You can check in from 11:30.',
    );
    expect(outsideWindowMessage(timed, Date.parse('2026-11-06T13:05:00Z'))).toBe(
      'This booking ended at 14:00.',
    );
  });
});
