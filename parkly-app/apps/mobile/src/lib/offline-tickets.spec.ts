import { describe, expect, it } from 'vitest';
import { chunkedStorage, memoryStore } from './chunked-storage';
import { offlineTickets } from './offline-tickets';

const booking = (id: string, qrToken: string | null) => ({
  id,
  code: 'PK-7VBZNQ',
  status: 'CONFIRMED' as const,
  product: 'HOURLY' as const,
  startAt: '2026-10-23T07:00:00.000Z',
  endAt: '2026-10-23T09:00:00.000Z',
  holdExpiresAt: null,
  lot: {
    id: '01a162b3-dcae-740c-a25a-e148a6951c2e',
    slug: 'eko',
    name: 'Eko Hotel Car Park',
    addressLine: 'VI',
  },
  vehicle: { id: '01a162b3-dcae-740c-a25a-e148a6951c2f', plate: 'LND123AB' },
  priceKobo: 100000,
  serviceFeeKobo: 10000,
  totalKobo: 110000,
  lines: [],
  qrToken,
  createdAt: '2026-10-22T16:41:26.000Z',
});

const ID = (n: number) => `01a1647d-297b-7248-a1ac-7f06faee39${String(n).padStart(2, '0')}`;

describe('offline tickets', () => {
  it('keeps only paid bookings with a ticket, per driver, and finds them offline', async () => {
    const tickets = offlineTickets(chunkedStorage(memoryStore()));
    await tickets.save('u1', [booking(ID(1), 'PK1.a.b.c'), booking(ID(2), null)]);
    expect((await tickets.all('u1')).map((b) => b.id)).toEqual([ID(1)]);
    expect(await tickets.find('u1', ID(1))).toMatchObject({ qrToken: 'PK1.a.b.c' });
    expect(await tickets.all('u2')).toEqual([]);
  });

  it('puts the newest first, replaces a ticket and clears on sign-out', async () => {
    const tickets = offlineTickets(chunkedStorage(memoryStore()));
    await tickets.put('u1', booking(ID(1), 'PK1.old'));
    await tickets.put('u1', booking(ID(2), 'PK1.two'));
    await tickets.put('u1', booking(ID(1), 'PK1.new'));
    expect((await tickets.all('u1')).map((b) => b.qrToken)).toEqual(['PK1.new', 'PK1.two']);
    await tickets.clear('u1');
    expect(await tickets.all('u1')).toEqual([]);
  });

  it('ignores damaged storage', async () => {
    const store = chunkedStorage(memoryStore());
    await store.setItem('parkly.tickets.u1', '{not json');
    expect(await offlineTickets(store).all('u1')).toEqual([]);
  });
});
