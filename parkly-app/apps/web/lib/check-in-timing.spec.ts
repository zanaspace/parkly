import type { Booking } from '@parkly/contracts';
import { describe, expect, it } from 'vitest';
import { checkInNotYet, outsideWindowMessage } from './check-in-timing';

// A 12:00–14:00 Lagos booking; check-in opens at 11:30.
const b = (over: Partial<Booking> = {}) =>
  ({
    startAt: '2026-11-06T11:00:00.000Z',
    endAt: '2026-11-06T13:00:00.000Z',
    checkInOpensAt: '2026-11-06T10:30:00.000Z',
    ...over,
  }) as Booking;

describe('check-in timing (ADR 0023)', () => {
  it('says when check-in opens while it is too early, then offers it', () => {
    expect(checkInNotYet(b(), Date.parse('2026-11-06T10:11:00Z'))).toBe(
      'Check-in opens at 11:30 (30 minutes before your booking).',
    );
    expect(checkInNotYet(b(), Date.parse('2026-11-06T10:30:00Z'))).toBeNull();
    expect(checkInNotYet(b({ checkInOpensAt: null }), 0)).toBeNull();
  });

  it('explains a refused check-in: early with the time, or ended', () => {
    expect(outsideWindowMessage(b(), Date.parse('2026-11-06T10:11:00Z'))).toBe(
      'You’re early. You can check in from 11:30.',
    );
    expect(outsideWindowMessage(b(), Date.parse('2026-11-06T13:05:00Z'))).toBe(
      'This booking ended at 14:00.',
    );
  });
});
