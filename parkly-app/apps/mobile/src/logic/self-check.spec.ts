import type { Booking } from '@parkly/contracts';
import { describe, expect, it } from 'vitest';
import { selfCheckKind } from './self-check';

const b = (over: Partial<Booking>, selfCheckIn = true) =>
  ({ status: 'CONFIRMED', stay: null, ...over, lot: { selfCheckIn } }) as unknown as Booking;

describe('selfCheckKind (ADR 0016)', () => {
  it('offers check-in, then check-out, only where the owner allows it', () => {
    expect(selfCheckKind(b({}))).toBe('in');
    expect(selfCheckKind(b({}, false))).toBeNull();
    const stay = { checkedInAt: 'x', checkedOutAt: null, overstayMinutes: 0, overstayKobo: 0 };
    expect(selfCheckKind(b({ status: 'CHECKED_IN', stay }))).toBe('out');
    expect(
      selfCheckKind(b({ status: 'COMPLETED', stay: { ...stay, checkedOutAt: 'y' } })),
    ).toBeNull();
    expect(selfCheckKind(b({ status: 'CANCELLED' }))).toBeNull();
  });
});
