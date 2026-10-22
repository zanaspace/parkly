import { randomUUID } from 'node:crypto';
import { quote } from '@parkly/domain/pricing';
import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../../store/memory.js';
import { world } from '../../test-helpers.js';

// TEST_NOW is Monday 2026-10-19 09:00 Lagos. "Tomorrow 08:00–18:00" in Lagos:
const START = '2026-10-20T07:00:00.000Z';
const END = '2026-10-20T17:00:00.000Z';
const ORIGIN = { lat: 6.4281, lng: 3.4219 }; // Eko Hotel, Victoria Island

type LotOpts = {
  name: string;
  north?: number; // metres north of the origin
  status?: 'LIVE' | 'SUSPENDED';
  permitExpires?: string;
  hourlyKobo?: number | null;
  dailyKobo?: number;
  amenities?: string[];
  hours?: 'weekdays' | 'none';
  photo?: boolean;
};

/** Builds a lot the way S2 does (operator → lot → permit → visit → price → LIVE). */
async function addLot(store: MemoryStore, opts: LotOpts) {
  const ownerId = randomUUID();
  store.seedUser(ownerId, { roles: [] });
  const op = await store.operators.create({
    legalName: `${opts.name} Ltd`,
    tradingName: opts.name,
    type: 'HOTEL',
    cacNumberEnc: null,
    tinEnc: null,
    addressLine: null,
    contactEmail: null,
    contactPhoneEnc: null,
    ownerUserId: ownerId,
    commissionBps: 1200,
  });
  Object.assign(store.operatorRows.get(op.id) ?? {}, { status: 'ACTIVE', kybStatus: 'APPROVED' });
  const lot = await store.lots.create({
    operatorId: op.id,
    type: 'HOTEL',
    name: opts.name,
    slug: opts.name.toLowerCase().replace(/\W+/g, '-'),
    description: null,
    addressLine: 'Victoria Island',
    area: 'Victoria Island',
    lga: 'Eti-Osa',
    location: { lat: ORIGIN.lat + (opts.north ?? 0) / 111_195, lng: ORIGIN.lng },
    entranceNotes: 'Gate B',
    capacityTotal: 50,
    capacityBookable: 20,
    amenities: opts.amenities ?? ['GUARD'],
    vehicleTypes: ['CAR'],
    createdBy: ownerId,
  });
  const reviewer = { reviewerId: ownerId, at: new Date('2026-10-10T10:00:00Z') };
  const permit = await store.permits.create({
    lotId: lot.id,
    permitNumber: 'LASPA/VI/2026/0012',
    issuedAt: '2026-01-10',
    expiresAt: opts.permitExpires ?? '2027-01-09',
    documentFileId: randomUUID(),
    submittedBy: ownerId,
  });
  await store.permits.approve(permit.id, { ...reviewer, note: 'checked' });
  const visit = await store.verifications.create({
    lotId: lot.id,
    inspectorUserId: ownerId,
    inspectedAt: new Date('2026-10-09T10:00:00Z'),
    capacityCounted: 50,
    gps: null,
    notes: null,
    validUntil: '2027-10-09',
    items: [
      { item: 'LASPA_PERMIT', result: 'PASS', comment: null },
      { item: 'GUARD_PRESENCE', result: 'PASS', comment: null },
      { item: 'CCTV', result: 'NA', comment: null },
    ],
  });
  await store.verifications.approve(visit.id, reviewer);
  const price = async (product: 'HOURLY' | 'DAILY', kobo: number) => {
    const p = await store.ratePlans.submit({
      lotId: lot.id,
      product,
      hourlyRateKobo: product === 'HOURLY' ? kobo : null,
      minMinutes: 60,
      dailyCapKobo: null,
      dailyRateKobo: product === 'DAILY' ? kobo : null,
      monthlyRateKobo: null,
      submittedBy: ownerId,
    });
    await store.ratePlans.approve(p.id, reviewer);
  };
  if (opts.hourlyKobo !== null) await price('HOURLY', opts.hourlyKobo ?? 50_000);
  if (opts.dailyKobo) await price('DAILY', opts.dailyKobo);
  if (opts.hours !== 'none')
    await store.lots.setOpeningHours(
      lot.id,
      [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        is24h: false,
        opensAt: '06:00',
        closesAt: '22:00',
      })),
    );
  if (opts.photo) {
    const fileId = randomUUID();
    await store.files.create({
      id: fileId,
      bucket: 'lot-photos',
      path: `lots/${lot.id}/a.webp`,
      dataClass: 'C3',
      retentionPolicy: 'lot_life',
      ownerEntityType: 'lot',
      ownerEntityId: lot.id,
      uploadedBy: ownerId,
      mime: 'image/webp',
      sizeBytes: 10,
      sha256: Buffer.alloc(32),
      createdAt: new Date('2026-10-09T10:00:00Z'),
    });
    const publicId = randomUUID();
    await store.files.create({
      id: publicId,
      bucket: 'lot-photos-public',
      path: `lots/${lot.id}/a.webp`,
      dataClass: 'C1',
      retentionPolicy: 'lot_life',
      ownerEntityType: 'lot',
      ownerEntityId: lot.id,
      uploadedBy: ownerId,
      mime: 'image/webp',
      sizeBytes: 10,
      sha256: Buffer.alloc(32),
      createdAt: new Date('2026-10-09T10:00:00Z'),
    });
    const photo = await store.lotPhotos.create({ lotId: lot.id, fileId, sort: 0 });
    await store.lotPhotos.review(
      photo.id,
      { status: 'APPROVED', publicFileId: publicId },
      reviewer,
    );
  }
  await store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null);
  await store.lots.setStatus(op.id, lot.id, 'PENDING_VERIFICATION', 'LIVE', null);
  if (opts.status === 'SUSPENDED')
    await store.lots.setStatus(op.id, lot.id, 'LIVE', 'SUSPENDED', 'Safety');
  return { lot, operatorId: op.id };
}

const search = (w: ReturnType<typeof world>, extra: Record<string, string> = {}) =>
  w.call(
    'GET',
    `/v1/lots/search?${new URLSearchParams({
      lat: String(ORIGIN.lat),
      lng: String(ORIGIN.lng),
      startAt: START,
      endAt: END,
      ...extra,
    }).toString()}`,
  );
type Item = { name: string; distanceM: number; quote: { totalKobo: number }; [k: string]: unknown };
const names = (res: Awaited<ReturnType<typeof search>>) =>
  (res.body?.items as Item[]).map((i) => i.name);

describe('GET /v1/lots/search (FR-LOT-101)', () => {
  it('Scenario: search returns only bookable verified lots', async () => {
    const w = world();
    await addLot(w.store, { name: 'Far Lot', north: 1500 });
    await addLot(w.store, { name: 'Near Lot', north: 100 });
    await addLot(w.store, { name: 'Middle Lot', north: 800 });
    await addLot(w.store, { name: 'Suspended Lot', north: 300, status: 'SUSPENDED' });

    const res = await search(w); // no sign-in needed
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Near Lot', 'Middle Lot', 'Far Lot']);
    const first = (res.body?.items as Item[])[0];
    // ₦500/h for 10 h = ₦5,000 + ₦100 fee, priced by the domain engine.
    expect(first).toMatchObject({
      distanceM: 100,
      isOpen: true,
      availableCount: 20,
      isAvailable: true,
      quote: { priceKobo: 500_000, serviceFeeKobo: 10_000, totalKobo: 510_000 },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/commission|operatorAmount/i);
  });

  it('matches the domain pricing engine exactly', async () => {
    const w = world();
    await addLot(w.store, { name: 'Priced', hourlyKobo: 33_300 });
    const res = await search(w);
    const engine = quote({
      ratePlan: {
        product: 'HOURLY',
        hourlyRateKobo: 33_300,
        minMinutes: 60,
        dailyCapKobo: null,
        dailyRateKobo: null,
        monthlyRateKobo: null,
      },
      startAt: new Date(START),
      endAt: new Date(END),
      settings: { serviceFeeKobo: 10_000, serviceFeeMaxDurationMin: 1440, commissionBps: 1200 },
    });
    expect(engine.ok && (res.body?.items as Item[])[0]?.quote.totalKobo).toBe(
      engine.ok && engine.quote.totalKobo,
    );
  });

  it('hides lots with an expired permit, a suspended operator, or outside the radius', async () => {
    const w = world();
    await addLot(w.store, { name: 'Expired', permitExpires: '2026-10-19' });
    const suspended = await addLot(w.store, { name: 'Operator Off' });
    Object.assign(w.store.operatorRows.get(suspended.operatorId) ?? {}, { status: 'SUSPENDED' });
    await addLot(w.store, { name: 'Outside', north: 2500 });
    await addLot(w.store, { name: 'Visible' });
    expect(names(await search(w))).toEqual(['Visible']);
    expect(names(await search(w, { radiusM: '3000' }))).toEqual(['Visible', 'Outside']);
  });

  it('shows a lot only for the products it sells', async () => {
    const w = world();
    await addLot(w.store, { name: 'Daily Only', hourlyKobo: null, dailyKobo: 300_000 });
    await addLot(w.store, { name: 'Hourly Only' });
    expect(names(await search(w))).toEqual(['Hourly Only']);
    const daily = await search(w, {
      product: 'DAILY',
      startAt: '2026-10-19T23:00:00.000Z',
      endAt: '2026-10-20T23:00:00.000Z',
    });
    expect(names(daily)).toEqual(['Daily Only']);
  });

  it('counts free spaces from the slot inventory, and 0 when closed', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Busy' });
    await addLot(w.store, { name: 'Closed', hours: 'none', north: 50 });
    w.store.slotRows.push({
      lotId: lot.id,
      slotStart: new Date('2026-10-20T12:00:00Z'),
      capacity: 20,
      booked: 15,
      held: 2,
      passReserved: 0,
      blocked: 0,
    });
    const items = (await search(w)).body?.items as Item[];
    expect(items.find((i) => i.name === 'Busy')).toMatchObject({ availableCount: 3 });
    expect(items.find((i) => i.name === 'Closed')).toMatchObject({
      isOpen: false,
      availableCount: 0,
      isAvailable: false,
    });
  });

  it('filters by amenities, sorts by price, and links the first public photo', async () => {
    const w = world();
    await addLot(w.store, { name: 'Cheap', north: 900, hourlyKobo: 30_000, amenities: ['CCTV'] });
    await addLot(w.store, { name: 'Dear', north: 100, hourlyKobo: 90_000, amenities: ['CCTV'] });
    await addLot(w.store, { name: 'Plain', north: 50, photo: true });
    expect(names(await search(w, { amenities: 'CCTV' }))).toEqual(['Dear', 'Cheap']);
    expect(names(await search(w, { sort: 'price' }))).toEqual(['Cheap', 'Plain', 'Dear']);
    const plain = ((await search(w)).body?.items as Item[]).find((i) => i.name === 'Plain');
    expect(plain?.photoUrl).toMatch(/^https:\/\/storage\.fake\/public\/lot-photos-public\//);
  });

  it('refuses windows in the past, off the grid or too long (SEARCH_INVALID_WINDOW)', async () => {
    const w = world();
    for (const window of [
      { startAt: '2026-10-19T06:00:00.000Z', endAt: '2026-10-19T09:00:00.000Z' },
      { startAt: '2026-10-20T07:10:00.000Z', endAt: END },
      { startAt: START, endAt: '2026-10-21T08:00:00.000Z' },
    ]) {
      const res = await search(w, window);
      expect([res.status, res.body?.code]).toEqual([400, 'SEARCH_INVALID_WINDOW']);
    }
    expect((await search(w, { radiusM: '9000' })).status).toBe(400);
  });
});

describe('GET /v1/lots/:idOrSlug (FR-LOT-102)', () => {
  it('shows the public lot page by slug or id, with the verified sheet', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Eko Hotel Car Park', photo: true });
    const res = await w.call('GET', '/v1/lots/eko-hotel-car-park');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60');
    expect(res.body).toMatchObject({
      id: lot.id,
      operatorName: 'Eko Hotel Car Park',
      entranceNotes: 'Gate B',
      prices: [expect.objectContaining({ product: 'HOURLY', hourlyRateKobo: 50_000 })],
      verification: {
        permitNumberLast4: '0012',
        verifiedOn: '2026-10-09',
        checksPassed: ['LASPA_PERMIT', 'GUARD_PRESENCE'],
      },
    });
    expect((res.body?.photos as unknown[]).length).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('LASPA/VI/2026');
    expect((await w.call('GET', `/v1/lots/${lot.id}`)).status).toBe(200);
  });

  it('is LOT_NOT_FOUND for lots drivers must not see', async () => {
    const w = world();
    await addLot(w.store, { name: 'Gone', status: 'SUSPENDED' });
    const res = await w.call('GET', '/v1/lots/gone');
    expect([res.status, res.body?.code]).toEqual([404, 'LOT_NOT_FOUND']);
  });
});

describe('availability and quotes', () => {
  it('reports free spaces for a window', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Avail' });
    const res = await w.call(
      'GET',
      `/v1/lots/${lot.id}/availability?startAt=${START}&endAt=${END}`,
    );
    expect(res.body).toEqual({ isOpen: true, availableCount: 20, isAvailable: true });
  });

  it('quotes hourly, daily-only refusal, minimum stay, closed hours and the past', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Quote' });
    const post = (body: Record<string, string>) =>
      w.call('POST', `/v1/lots/${lot.id}/quote`, { body });
    const ok = await post({ product: 'HOURLY', startAt: START, endAt: END });
    expect(ok.body).toMatchObject({ priceKobo: 500_000, totalKobo: 510_000 });
    expect(ok.body?.lines).toEqual([
      { kind: 'HOURLY_DAY', date: '2026-10-20', minutes: 600, amountKobo: 500_000, capped: false },
      { kind: 'SERVICE_FEE', amountKobo: 10_000 },
    ]);
    expect((await post({ product: 'DAILY', startAt: START, endAt: END })).body?.code).toBe(
      'LOT_NOT_BOOKABLE',
    );
    const short = await post({
      product: 'HOURLY',
      startAt: START,
      endAt: '2026-10-20T07:30:00.000Z',
    });
    expect([short.status, short.body?.code]).toEqual([400, 'PRICING_INVALID_DURATION']);
    const late = await post({
      product: 'HOURLY',
      startAt: '2026-10-20T20:00:00.000Z',
      endAt: '2026-10-20T22:00:00.000Z',
    });
    expect([late.status, late.body?.code]).toEqual([422, 'BOOKING_OUTSIDE_OPENING_HOURS']);
    const past = await post({
      product: 'HOURLY',
      startAt: '2026-10-18T07:00:00.000Z',
      endAt: '2026-10-18T09:00:00.000Z',
    });
    expect([past.status, past.body?.code]).toEqual([400, 'BOOKING_WINDOW_INVALID']);
  });
});

describe('monthly quotes and edge cases', () => {
  it('quotes a monthly pass from today, never in the past, without a service fee', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Monthly' });
    const plan = await w.store.ratePlans.submit({
      lotId: lot.id,
      product: 'MONTHLY',
      hourlyRateKobo: null,
      minMinutes: 60,
      dailyCapKobo: null,
      dailyRateKobo: null,
      monthlyRateKobo: 4_500_000,
      submittedBy: randomUUID(),
    });
    await w.store.ratePlans.approve(plan.id, { reviewerId: randomUUID(), at: new Date() });
    const post = (startAt: string) =>
      w.call('POST', `/v1/lots/${lot.id}/quote`, {
        body: { product: 'MONTHLY', startAt, endAt: startAt },
      });
    const ok = await post('2026-10-20T07:00:00.000Z');
    expect(ok.body).toMatchObject({ priceKobo: 4_500_000, serviceFeeKobo: 0 });
    expect(ok.body?.lines).toEqual([
      {
        kind: 'MONTH',
        periodStart: '2026-10-20',
        periodEnd: '2026-11-18',
        amountKobo: 4_500_000,
      },
    ]);
    const past = await post('2026-10-17T07:00:00.000Z');
    expect([past.status, past.body?.code]).toEqual([400, 'BOOKING_WINDOW_INVALID']);
  });

  it('is LOT_NOT_FOUND for unknown lots and refuses a bad availability window', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Edge' });
    const missing = await w.call('POST', `/v1/lots/${randomUUID()}/quote`, {
      body: { product: 'HOURLY', startAt: START, endAt: END },
    });
    expect([missing.status, missing.body?.code]).toEqual([404, 'LOT_NOT_FOUND']);
    const bad = await w.call(
      'GET',
      `/v1/lots/${lot.id}/availability?startAt=${END}&endAt=${START}`,
    );
    expect([bad.status, bad.body?.code]).toEqual([400, 'SEARCH_INVALID_WINDOW']);
  });

  it('reports a closed lot as unavailable', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Shut', hours: 'none' });
    const res = await w.call(
      'GET',
      `/v1/lots/${lot.id}/availability?startAt=${START}&endAt=${END}`,
    );
    expect(res.body).toEqual({ isOpen: false, availableCount: 0, isAvailable: false });
  });

  it('skips a lot whose minimum stay is longer than the search', async () => {
    const w = world();
    const { lot } = await addLot(w.store, { name: 'Long Stay', hourlyKobo: null });
    const plan = await w.store.ratePlans.submit({
      lotId: lot.id,
      product: 'HOURLY',
      hourlyRateKobo: 50_000,
      minMinutes: 720,
      dailyCapKobo: null,
      dailyRateKobo: null,
      monthlyRateKobo: null,
      submittedBy: randomUUID(),
    });
    await w.store.ratePlans.approve(plan.id, { reviewerId: randomUUID(), at: new Date() });
    expect(names(await search(w))).toEqual([]);
  });
});
