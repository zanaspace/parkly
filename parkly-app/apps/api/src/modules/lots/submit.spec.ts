import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { TEST_NOW, world } from '../../test-helpers.js';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pdf = new Uint8Array(Buffer.from('%PDF-1.7\nLASPA permit scan\n%%EOF'));

async function setup() {
  const w = world();
  const owner = w.user([], 'Ada');
  const op = await w.call('POST', '/v1/operators', {
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
  const operatorId = op.body?.id as string;
  const as = (who: string) => ({ as: who, aal: 'aal2' as const });
  const lot = await w.call('POST', `/v1/operators/${operatorId}/lots`, {
    ...as(owner),
    body: {
      name: 'Eko Hotel Car Park',
      type: 'HOTEL',
      addressLine: 'Adetokunbo Ademola St, Victoria Island',
      location: { lat: 6.4281, lng: 3.4219 },
      capacityTotal: 300,
      capacityBookable: 120,
      amenities: ['GUARD'],
      vehicleTypes: ['CAR'],
    },
  });
  const lotId = lot.body?.id as string;
  const base = `/v1/operators/${operatorId}/lots/${lotId}`;
  return { w, owner, operatorId, lotId, base, as };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function uploadPermit(ctx: Ctx, dates = { issuedAt: '2026-01-10', expiresAt: '2027-01-09' }) {
  const presign = await ctx.w.call('POST', `${ctx.base}/permits/document`, {
    ...ctx.as(ctx.owner),
    body: { contentType: 'application/pdf', sizeBytes: pdf.length, sha256: sha(pdf) },
  });
  const fileId = presign.body?.fileId as string;
  const file = await ctx.w.store.files.find(fileId);
  if (file) ctx.w.storage.put(file.bucket, file.path, pdf);
  return ctx.w.call('POST', `${ctx.base}/permits`, {
    ...ctx.as(ctx.owner),
    body: { permitNumber: 'LASPA/VI/2026/0012', ...dates, fileId },
  });
}

async function addPhotos(ctx: Ctx, n: number) {
  for (let i = 0; i < n; i++) {
    const bytes = new Uint8Array(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: '#345' } })
        .jpeg()
        .toBuffer(),
    );
    const presign = await ctx.w.call('POST', `${ctx.base}/photos`, {
      ...ctx.as(ctx.owner),
      body: { contentType: 'image/jpeg', sizeBytes: bytes.length, sha256: sha(bytes) },
    });
    const file = await ctx.w.store.files.find(presign.body?.fileId as string);
    if (file) ctx.w.storage.put(file.bucket, file.path, bytes);
    await ctx.w.call(
      'POST',
      `${ctx.base}/photos/${presign.body?.fileId as string}/complete`,
      ctx.as(ctx.owner),
    );
  }
}

describe('LASPA permit (FR-LOT-003)', () => {
  it('records the permit with its scan in the private permits bucket', async () => {
    const ctx = await setup();
    const res = await uploadPermit(ctx);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      permitNumber: 'LASPA/VI/2026/0012',
      issuer: 'LASPA',
      expiresAt: '2027-01-09',
      status: 'SUBMITTED',
    });
    const lot = await ctx.w.call('GET', ctx.base, ctx.as(ctx.owner));
    expect(lot.body?.permit).toMatchObject({ permitNumber: 'LASPA/VI/2026/0012' });
    expect(ctx.w.store.auditRows.map((a) => a.action)).toContain('lot.permit_submitted');
  });

  it('refuses an expired permit (PERMIT_EXPIRED) and impossible dates', async () => {
    const ctx = await setup();
    // TEST_NOW is 2026-10-19.
    expect(TEST_NOW.toISOString().slice(0, 10)).toBe('2026-10-19');
    const expired = await uploadPermit(ctx, { issuedAt: '2025-01-01', expiresAt: '2026-10-19' });
    expect([expired.status, expired.body?.code]).toEqual([422, 'PERMIT_EXPIRED']);
    const backwards = await uploadPermit(ctx, { issuedAt: '2026-05-01', expiresAt: '2026-04-01' });
    expect([backwards.status, backwards.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
    expect(ctx.w.store.permitRows).toEqual([]);
  });

  it('needs the scan to have been uploaded', async () => {
    const ctx = await setup();
    const presign = await ctx.w.call('POST', `${ctx.base}/permits/document`, {
      ...ctx.as(ctx.owner),
      body: { contentType: 'application/pdf', sizeBytes: pdf.length, sha256: sha(pdf) },
    });
    const res = await ctx.w.call('POST', `${ctx.base}/permits`, {
      ...ctx.as(ctx.owner),
      body: {
        permitNumber: 'LASPA/1',
        issuedAt: '2026-01-10',
        expiresAt: '2027-01-09',
        fileId: presign.body?.fileId,
      },
    });
    expect([res.status, res.body?.code]).toEqual([409, 'UPLOAD_NOT_RECEIVED']);
  });
});

describe('rate plans (FR-LOT-005)', () => {
  it('submits prices for approval; a change replaces the pending one', async () => {
    const ctx = await setup();
    const url = `${ctx.base}/rate-plans`;
    const first = await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: { product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 60 },
    });
    expect(first.body).toMatchObject({ status: 'PENDING_APPROVAL', hourlyRateKobo: 50_000 });
    await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: { product: 'HOURLY', hourlyRateKobo: 70_000, minMinutes: 120 },
    });
    await ctx.w.call('PUT', url, {
      ...ctx.as(ctx.owner),
      body: { product: 'DAILY', dailyRateKobo: 300_000 },
    });
    const lot = await ctx.w.call('GET', ctx.base, ctx.as(ctx.owner));
    expect(
      (lot.body?.ratePlans as { product: string; hourlyRateKobo: number | null }[]).map((p) => [
        p.product,
        p.hourlyRateKobo,
      ]),
    ).toEqual([
      ['HOURLY', 70_000],
      ['DAILY', null],
    ]);
    expect(
      ctx.w.store.auditRows.filter((a) => a.action === 'lot.rate_plan_submitted'),
    ).toHaveLength(3);
  });

  it('rejects prices the domain rules refuse (RATE_PLAN_INVALID)', async () => {
    const ctx = await setup();
    const res = await ctx.w.call('PUT', `${ctx.base}/rate-plans`, {
      ...ctx.as(ctx.owner),
      body: { product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 50 },
    });
    expect([res.status, res.body?.code]).toEqual([400, 'RATE_PLAN_INVALID']);
    expect(res.body?.errors).toEqual([
      {
        path: 'minMinutes',
        message: 'The minimum stay must be 15 minutes to 24 hours, in 15-minute steps.',
      },
    ]);
  });
});

describe('submit for verification (doc 02 §3.3 DRAFT → PENDING_VERIFICATION)', () => {
  it('lists everything still missing', async () => {
    const ctx = await setup();
    await addPhotos(ctx, 1);
    const res = await ctx.w.call('POST', `${ctx.base}/submit`, ctx.as(ctx.owner));
    expect([res.status, res.body?.code]).toEqual([422, 'LOT_INCOMPLETE']);
    expect((res.body?.errors as { path: string }[]).map((e) => e.path)).toEqual([
      'PHOTOS',
      'OPENING_HOURS',
      'RATE_PLAN',
      'PERMIT',
      'PAYOUT_ACCOUNT',
    ]);
  });

  it('moves a complete lot to PENDING_VERIFICATION and then locks it', async () => {
    const ctx = await setup();
    await addPhotos(ctx, 3);
    await ctx.w.call('PUT', `${ctx.base}/opening-hours`, {
      ...ctx.as(ctx.owner),
      body: { days: [{ weekday: 1, is24h: true }] },
    });
    await ctx.w.call('PUT', `${ctx.base}/rate-plans`, {
      ...ctx.as(ctx.owner),
      body: { product: 'DAILY', dailyRateKobo: 300_000 },
    });
    await uploadPermit(ctx);
    await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '058', accountNumber: '0123456789' },
    });

    const res = await ctx.w.call('POST', `${ctx.base}/submit`, ctx.as(ctx.owner));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PENDING_VERIFICATION' });
    expect(ctx.w.store.auditRows.map((a) => a.action)).toContain('lot.submitted');

    const again = await ctx.w.call('POST', `${ctx.base}/submit`, ctx.as(ctx.owner));
    expect([again.status, again.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
    const edit = await ctx.w.call('PUT', `${ctx.base}/rate-plans`, {
      ...ctx.as(ctx.owner),
      body: { product: 'DAILY', dailyRateKobo: 1 },
    });
    expect(edit.status).toBe(409);
  });
});
