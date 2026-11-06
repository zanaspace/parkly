import { describe, expect, it } from 'vitest';
import type { Booking } from '@parkly/contracts';
import { upcomingTabLabel } from './booking-tabs';

function mockBooking(over: Partial<Booking>): Booking {
  return {
    id: 'b-1',
    code: 'PK-ABCDEF',
    driverId: 'd-1',
    lotId: 'l-1',
    startAt: '2026-11-06T20:00:00.000Z',
    endAt: '2026-11-06T21:00:00.000Z',
    status: 'CONFIRMED',
    product: 'HOURLY',
    priceKobo: 30_000,
    serviceFeeKobo: 1_500,
    totalKobo: 31_500,
    holdingFeeKobo: 0,
    source: 'MOBILE',
    lot: { id: 'l-1', name: 'Test Lot', addressLine: '1 Test St' },
    vehicle: { id: 'v-1', plate: '1234LDU' },
    ...over,
  };
}

describe('upcomingTabLabel', () => {
  it('returns "Upcoming" when there are no bookings or null', () => {
    expect(upcomingTabLabel(null)).toBe('Upcoming');
    expect(upcomingTabLabel([])).toBe('Upcoming');
  });

  it('returns "Upcoming" when bookings are confirmed but not checked in yet', () => {
    const b = mockBooking({ status: 'CONFIRMED', stay: undefined });
    expect(upcomingTabLabel([b])).toBe('Upcoming');
  });

  it('returns "Active" when a booking is checked in (parked)', () => {
    const b = mockBooking({
      status: 'CHECKED_IN',
      stay: {
        checkedInAt: '2026-11-06T20:10:00.000Z',
        checkedOutAt: null,
        overstayMinutes: 0,
        overstayKobo: 0,
      },
    });
    expect(upcomingTabLabel([b])).toBe('Active');
  });

  it('returns "Active & Upcoming" when there is both an active stay and a future booking', () => {
    const active = mockBooking({
      id: 'b-1',
      status: 'CHECKED_IN',
      stay: {
        checkedInAt: '2026-11-06T20:10:00.000Z',
        checkedOutAt: null,
        overstayMinutes: 0,
        overstayKobo: 0,
      },
    });
    const future = mockBooking({
      id: 'b-2',
      status: 'CONFIRMED',
      startAt: '2026-11-07T10:00:00.000Z',
      endAt: '2026-11-07T11:00:00.000Z',
    });
    expect(upcomingTabLabel([active, future])).toBe('Active & Upcoming');
  });
});
