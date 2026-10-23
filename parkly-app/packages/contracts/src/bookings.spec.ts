import { describe, expect, it } from 'vitest';
import { BookingSchema } from './bookings.js';

describe('BookingSchema', () => {
  it('reads a booking from an API that predates self check-in as "off"', () => {
    const lot = {
      id: '01a162b3-dcae-740c-a25a-e148a6951c2e',
      slug: 'eko',
      name: 'Eko',
      addressLine: 'VI',
    };
    const parsed = BookingSchema.shape.lot.parse(lot);
    expect(parsed.selfCheckIn).toBe(false);
    expect(BookingSchema.shape.lot.parse({ ...lot, selfCheckIn: true }).selfCheckIn).toBe(true);
  });
});
