import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const newLot = {
  name: 'Eko Hotel Car Park',
  type: 'HOTEL',
  addressLine: 'Adetokunbo Ademola St, Victoria Island',
  area: 'Victoria Island',
  location: { lat: 6.4281, lng: 3.4219 },
  capacityTotal: 300,
  capacityBookable: 120,
  amenities: ['GUARD', 'CCTV', 'LIGHTING'],
  vehicleTypes: ['CAR', 'SUV'],
};

async function setup() {
  const w = world();
  const owner = w.user([], 'Ada');
  const res = await w.call('POST', '/v1/operators', {
    as: owner,
    body: {
      legalName: 'Eko Hotels Ltd',
      tradingName: 'Eko Hotel',
      type: 'HOTEL',
      cacNumber: 'RC 123456',
      addressLine: 'Victoria Island, Lagos',
      contactEmail: 'ops@ekohotel.ng',
      contactPhone: '08031234567',
      agreementVersion: '2026-10-01',
    },
  });
  const operatorId = res.body?.id as string;
  const manager = w.user([{ role: 'OPERATOR_MANAGER', operatorId }], 'Bola');
  const attendant = w.user([{ role: 'OPERATOR_ATTENDANT', operatorId }], 'Chidi');
  const as = (who: string) => ({ as: who, aal: 'aal2' as const });
  const base = `/v1/operators/${operatorId}/lots`;
  return { w, owner, manager, attendant, operatorId, as, base };
}

async function createLot(ctx: Awaited<ReturnType<typeof setup>>, body: object = newLot) {
  return ctx.w.call('POST', ctx.base, { ...ctx.as(ctx.owner), body });
}

describe('create and read lots (FR-LOT-002, doc 03 O-11)', () => {
  it('creates a DRAFT lot with a readable slug, and audits it', async () => {
    const ctx = await setup();
    const res = await createLot(ctx);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Eko Hotel Car Park',
      status: 'DRAFT',
      version: 1,
      capacityBookable: 120,
      openingHours: [],
      photos: [],
    });
    expect(res.body?.slug).toMatch(/^eko-hotel-car-park-[a-z0-9]{4}$/);
    expect(ctx.w.store.auditRows.map((a) => a.action)).toContain('lot.created');
  });

  it('lets managers create and list lots too', async () => {
    const ctx = await setup();
    await ctx.w.call('POST', ctx.base, { ...ctx.as(ctx.manager), body: newLot });
    const list = await ctx.w.call('GET', ctx.base, ctx.as(ctx.manager));
    expect((list.body?.items as { name: string; photoCount: number }[])[0]).toMatchObject({
      name: 'Eko Hotel Car Park',
      photoCount: 0,
    });
  });

  it('refuses a pin outside Lagos State', async () => {
    const ctx = await setup();
    const res = await createLot(ctx, { ...newLot, location: { lat: 9.0765, lng: 7.3986 } });
    expect([res.status, res.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
    expect(res.body?.errors).toEqual([
      { path: 'location', message: 'The pin must be in Lagos State.' },
    ]);
  });

  it('refuses more bookable spaces than the lot has', async () => {
    const ctx = await setup();
    const res = await createLot(ctx, { ...newLot, capacityTotal: 50, capacityBookable: 60 });
    expect(res.body?.errors).toEqual([
      {
        path: 'capacityBookable',
        message: 'Spaces offered on Parkly can’t be more than the lot’s total.',
      },
    ]);
  });

  it('gives each lot its own slug even with the same name', async () => {
    const ctx = await setup();
    const a = await createLot(ctx);
    const b = await createLot(ctx);
    expect(a.body?.slug).not.toBe(b.body?.slug);
  });

  it('keeps lots inside their operator: attendants and other operators get 404', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const asAttendant = await ctx.w.call('GET', ctx.base, { as: ctx.attendant, aal: 'aal1' });
    expect(asAttendant.status).toBe(404);
    const otherOperatorLot = await ctx.w.call(
      'GET',
      `/v1/operators/${randomUUID()}/lots/${lot.body?.id as string}`,
      ctx.as(ctx.owner),
    );
    expect(otherOperatorLot.status).toBe(404);
  });
});

describe('edit lots', () => {
  it('stops another operator from editing or adding photos (404)', async () => {
    const a = await setup();
    const b = await setup();
    const lot = await createLot(a);
    const lotId = lot.body?.id as string;
    // b's owner aims at a's lot through a's operator path.
    const patch = await b.w.call('PATCH', `${a.base}/${lotId}`, {
      ...b.as(b.owner),
      body: { version: 1, name: 'Hijacked' },
    });
    const photo = await b.w.call('POST', `${a.base}/${lotId}/photos`, {
      ...b.as(b.owner),
      body: { contentType: 'image/jpeg', sizeBytes: 100, sha256: 'a'.repeat(64) },
    });
    expect([patch.status, photo.status]).toEqual([404, 404]);
  });

  it('updates with the current version and rejects a stale one', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const url = `${ctx.base}/${lot.body?.id as string}`;
    const ok = await ctx.w.call('PATCH', url, {
      ...ctx.as(ctx.owner),
      body: { version: 1, capacityBookable: 150, entranceNotes: 'Enter by Gate 2' },
    });
    expect(ok.body).toMatchObject({
      version: 2,
      capacityBookable: 150,
      entranceNotes: 'Enter by Gate 2',
    });
    const stale = await ctx.w.call('PATCH', url, {
      ...ctx.as(ctx.owner),
      body: { version: 1, name: 'Old tab' },
    });
    expect([stale.status, stale.body?.code]).toEqual([409, 'CONFLICT_STALE_VERSION']);
  });

  it('checks capacity against the saved total when only one side changes', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const res = await ctx.w.call('PATCH', `${ctx.base}/${lot.body?.id as string}`, {
      ...ctx.as(ctx.owner),
      body: { version: 1, capacityBookable: 301 },
    });
    expect(res.body?.code).toBe('VALIDATION_FAILED');
  });

  it('only edits DRAFT lots for now', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const row = ctx.w.store.lotRows.get(lot.body?.id as string);
    if (row) row.status = 'PENDING_VERIFICATION';
    const res = await ctx.w.call('PATCH', `${ctx.base}/${lot.body?.id as string}`, {
      ...ctx.as(ctx.owner),
      body: { version: 1, name: 'Renamed' },
    });
    expect([res.status, res.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });

  it('sets opening hours, including overnight windows', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const url = `${ctx.base}/${lot.body?.id as string}/opening-hours`;
    const res = await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: {
        days: [
          { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '22:00' },
          { weekday: 5, is24h: false, opensAt: '18:00', closesAt: '06:00' },
          { weekday: 0, is24h: true },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body?.openingHours).toEqual([
      { weekday: 0, is24h: true },
      { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '22:00' },
      { weekday: 5, is24h: false, opensAt: '18:00', closesAt: '06:00' },
    ]);
    const bad = await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: { days: [{ weekday: 2, is24h: false, opensAt: '09:00', closesAt: '09:00' }] },
    });
    expect(bad.body?.errors).toEqual([
      { path: 'days.2', message: 'Opening and closing times can’t be the same.' },
    ]);
  });

  it('updates opening hours on a LIVE or PAUSED lot when no bookings conflict', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const lotId = lot.body?.id as string;
    const row = ctx.w.store.lotRows.get(lotId);
    if (row) row.status = 'LIVE';

    const url = `${ctx.base}/${lotId}/opening-hours`;
    const res = await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: {
        days: [{ weekday: 1, is24h: true }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body?.openingHours).toEqual([{ weekday: 1, is24h: true }]);
  });

  it('rejects opening hours updates on a LIVE lot that conflict with confirmed driver bookings', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const lotId = lot.body?.id as string;
    const row = ctx.w.store.lotRows.get(lotId);
    if (row) row.status = 'LIVE';

    // Existing booking on Monday (weekday 1) from 20:00 to 22:00 Lagos
    ctx.w.store.booking.bookingRows.push({
      id: randomUUID(),
      code: 'BK-CONF-1',
      driverId: 'driver-1',
      vehicleId: 'veh-1',
      plateNorm: 'ABC123XY',
      lotId,
      product: 'HOURLY',
      startAt: new Date(Date.UTC(2026, 9, 26, 19, 0)),
      endAt: new Date(Date.UTC(2026, 9, 26, 21, 0)),
      status: 'CONFIRMED',
      holdExpiresAt: null,
      priceKobo: 200_000,
      serviceFeeKobo: 10_000,
      totalKobo: 210_000,
      commissionBps: 1200,
      ratePlanId: 'rp-1',
      pricingBreakdown: [],
      source: 'MOBILE',
      createdAt: new Date(),
    });

    const url = `${ctx.base}/${lotId}/opening-hours`;
    // Attempt to change Monday hours to close early at 18:00
    const res = await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: {
        days: [{ weekday: 1, is24h: false, opensAt: '08:00', closesAt: '18:00' }],
      },
    });
    expect([res.status, res.body?.code]).toEqual([409, 'LOT_HAS_FUTURE_BOOKINGS']);
    expect(String(res.body?.detail).toLowerCase()).toContain('honoured');

    // Attempting to expand hours to 24h succeeds because it covers the booking
    const expand = await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: {
        days: [{ weekday: 1, is24h: true }],
      },
    });
    expect(expand.status).toBe(200);
  });

  it('rejects opening hours updates on lots under review or suspended', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const lotId = lot.body?.id as string;
    const row = ctx.w.store.lotRows.get(lotId);
    if (row) row.status = 'PENDING_VERIFICATION';

    const url = `${ctx.base}/${lotId}/opening-hours`;
    const res = await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: { days: [{ weekday: 1, is24h: true }] },
    });
    expect([res.status, res.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });
});

describe('lot photos (3–10 per lot)', () => {
  const jpeg = async () =>
    new Uint8Array(
      await sharp({ create: { width: 40, height: 30, channels: 3, background: '#556' } })
        .jpeg()
        .toBuffer(),
    );

  async function upload(ctx: Awaited<ReturnType<typeof setup>>, lotId: string, bytes: Uint8Array) {
    const presign = await ctx.w.call('POST', `${ctx.base}/${lotId}/photos`, {
      ...ctx.as(ctx.owner),
      body: { contentType: 'image/jpeg', sizeBytes: bytes.length, sha256: sha(bytes) },
    });
    const file = await ctx.w.store.files.find(presign.body?.fileId as string);
    if (file) ctx.w.storage.put(file.bucket, file.path, bytes);
    return ctx.w.call(
      'POST',
      `${ctx.base}/${lotId}/photos/${presign.body?.fileId as string}/complete`,
      ctx.as(ctx.owner),
    );
  }

  it('uploads into the private lot-photos bucket, re-encodes to WebP and lists in order', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const lotId = lot.body?.id as string;
    const first = await upload(ctx, lotId, await jpeg());
    const second = await upload(ctx, lotId, await jpeg());
    expect([first.status, second.status]).toEqual([201, 201]);
    const fetched = await ctx.w.call('GET', `${ctx.base}/${lotId}`, ctx.as(ctx.owner));
    expect(
      (fetched.body?.photos as { sort: number; status: string }[]).map((p) => [p.sort, p.status]),
    ).toEqual([
      [0, 'PENDING'],
      [1, 'PENDING'],
    ]);
    const stored = (await ctx.w.store.files.find(ctx.w.store.photoRows[0]?.fileId ?? ''))?.mime;
    expect(stored).toBe('image/webp');
  });

  it('stops at 10 photos', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const lotId = lot.body?.id as string;
    for (let i = 0; i < 10; i++) await upload(ctx, lotId, await jpeg());
    const eleventh = await ctx.w.call('POST', `${ctx.base}/${lotId}/photos`, {
      ...ctx.as(ctx.owner),
      body: { contentType: 'image/jpeg', sizeBytes: 100, sha256: 'a'.repeat(64) },
    });
    expect([eleventh.status, eleventh.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
  });

  it('removes a photo and its stored file', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const lotId = lot.body?.id as string;
    const photo = await upload(ctx, lotId, await jpeg());
    const del = await ctx.w.call(
      'DELETE',
      `${ctx.base}/${lotId}/photos/${photo.body?.id as string}`,
      ctx.as(ctx.owner),
    );
    expect(del.status).toBe(204);
    expect(ctx.w.store.photoRows).toEqual([]);
    expect([...ctx.w.storage.objects.keys()].filter((k) => k.startsWith('lot-photos/'))).toEqual(
      [],
    );
  });
});

describe('lot edge cases', () => {
  const jpeg = async () =>
    new Uint8Array(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: '#123' } })
        .jpeg()
        .toBuffer(),
    );

  it('returns 404 for a lot that does not exist', async () => {
    const ctx = await setup();
    const res = await ctx.w.call('GET', `${ctx.base}/${randomUUID()}`, ctx.as(ctx.owner));
    expect(res.status).toBe(404);
  });

  it('stores optional text as empty when left out', async () => {
    const ctx = await setup();
    const { area: _area, ...withoutArea } = newLot;
    const res = await createLot(ctx, withoutArea);
    expect(res.body).toMatchObject({
      area: null,
      lga: null,
      description: null,
      entranceNotes: null,
    });
  });

  it('de-duplicates amenities and vehicle types, and checks a moved pin', async () => {
    const ctx = await setup();
    const lot = await createLot(ctx);
    const url = `${ctx.base}/${lot.body?.id as string}`;
    const ok = await ctx.w.call('PATCH', url, {
      ...ctx.as(ctx.owner),
      body: { version: 1, amenities: ['CCTV', 'CCTV', 'EV'], vehicleTypes: ['BUS', 'BUS'] },
    });
    expect(ok.body).toMatchObject({ amenities: ['CCTV', 'EV'], vehicleTypes: ['BUS'] });
    const moved = await ctx.w.call('PATCH', url, {
      ...ctx.as(ctx.owner),
      body: { version: 2, location: { lat: 7.3775, lng: 3.947 } },
    });
    expect(moved.body?.errors).toEqual([
      { path: 'location', message: 'The pin must be in Lagos State.' },
    ]);
  });

  it('completes a photo once even if the browser retries, and handles missing or bad uploads', async () => {
    const ctx = await setup();
    const lotId = (await createLot(ctx)).body?.id as string;
    const bytes = await jpeg();
    const presign = await ctx.w.call('POST', `${ctx.base}/${lotId}/photos`, {
      ...ctx.as(ctx.owner),
      body: { contentType: 'image/jpeg', sizeBytes: bytes.length, sha256: sha(bytes) },
    });
    const fileId = presign.body?.fileId as string;
    const complete = () =>
      ctx.w.call('POST', `${ctx.base}/${lotId}/photos/${fileId}/complete`, ctx.as(ctx.owner));

    expect((await complete()).body?.code).toBe('UPLOAD_NOT_RECEIVED');
    const file = await ctx.w.store.files.find(fileId);
    if (file) ctx.w.storage.put(file.bucket, file.path, bytes);
    const first = await complete();
    const retry = await complete();
    expect([first.status, retry.status, retry.body?.id]).toEqual([201, 201, first.body?.id]);
    expect(ctx.w.store.photoRows).toHaveLength(1);

    const unknown = await ctx.w.call(
      'POST',
      `${ctx.base}/${lotId}/photos/${randomUUID()}/complete`,
      ctx.as(ctx.owner),
    );
    expect(unknown.status).toBe(404);

    const fake = new Uint8Array(Buffer.from('not really a jpeg, just text pretending'));
    const p2 = await ctx.w.call('POST', `${ctx.base}/${lotId}/photos`, {
      ...ctx.as(ctx.owner),
      body: { contentType: 'image/jpeg', sizeBytes: fake.length, sha256: sha(fake) },
    });
    const f2 = await ctx.w.store.files.find(p2.body?.fileId as string);
    if (f2) ctx.w.storage.put(f2.bucket, f2.path, fake);
    const rejected = await ctx.w.call(
      'POST',
      `${ctx.base}/${lotId}/photos/${p2.body?.fileId as string}/complete`,
      ctx.as(ctx.owner),
    );
    expect([rejected.status, rejected.body?.code, rejected.body?.detail]).toEqual([
      422,
      'UPLOAD_REJECTED',
      'TYPE_MISMATCH',
    ]);
  });

  it('returns 404 when removing a photo that is not on this lot', async () => {
    const ctx = await setup();
    const lotId = (await createLot(ctx)).body?.id as string;
    const res = await ctx.w.call(
      'DELETE',
      `${ctx.base}/${lotId}/photos/${randomUUID()}`,
      ctx.as(ctx.owner),
    );
    expect(res.status).toBe(404);
  });
});
