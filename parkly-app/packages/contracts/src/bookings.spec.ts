import { describe, expect, it } from 'vitest';
import { BookingSchema } from './bookings.js';

// A booking as an API from before Sprint 5 stories 5–7 sends it: no overstay,
// stay or lot.selfCheckIn. An app newer than the live API must still read it.
const older = {
  id: '01a162b3-dcae-740c-a25a-e148a6951c2d',
  code: 'PK7Q2M',
  status: 'PENDING_PAYMENT',
  product: 'HOURLY',
  startAt: '2026-10-23T01:00:00.000Z',
  endAt: '2026-10-23T05:00:00.000Z',
  holdExpiresAt: '2026-10-23T00:26:00.000Z',
  lot: { id: '01a162b3-dcae-740c-a25a-e148a6951c2e', slug: 'eko', name: 'Eko', addressLine: 'VI' },
  vehicle: { id: '01a162b3-dcae-740c-a25a-e148a6951c2f', plate: 'LND123AB' },
  priceKobo: 280000,
  serviceFeeKobo: 10000,
  totalKobo: 290000,
  lines: [],
  qrToken: null,
  createdAt: '2026-10-23T00:16:00.000Z',
};

describe('BookingSchema', () => {
  it('reads a booking from an older API, with the new fields off or empty', () => {
    const r = BookingSchema.safeParse(older);
    if (!r.success) throw r.error;
    expect(r.data).toMatchObject({ overstay: null, stay: null, lot: { selfCheckIn: false } });
  });
});
