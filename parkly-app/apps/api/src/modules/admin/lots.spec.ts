import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pdf = new Uint8Array(Buffer.from('%PDF-1.7\nLASPA permit scan\n%%EOF'));

const PASSING = ['LASPA_PERMIT', 'GUARD_PRESENCE', 'LIGHTING', 'CAPACITY_COUNT', 'OWNER_IDENTITY'];
const visitBody = (capacityCounted = 280, failing: string[] = []) => ({
  inspectedAt: '2026-10-18T10:00:00.000Z',
  capacityCounted,
  gps: { lat: 6.4282, lng: 3.422 },
  items: PASSING.map((item) => ({ item, result: failing.includes(item) ? 'FAIL' : 'PASS' })),
});

/**
 * Drives a lot through the real operator endpoints to PENDING_VERIFICATION,
 * with KYB already approved (that flow is tested in kyb.spec.ts).
 */
async function pendingLot() {
  const w = world();
  const owner = w.user([], 'Ada');
  const as = (who: string) => ({ as: who, aal: 'aal2' as const });
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
  for (let i = 0; i < 3; i++) {
    const bytes = new Uint8Array(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: '#345' } })
        .jpeg()
        .toBuffer(),
    );
    const presign = await w.call('POST', `${base}/photos`, {
      ...as(owner),
      body: { contentType: 'image/jpeg', sizeBytes: bytes.length, sha256: sha(bytes) },
    });
    const file = await w.store.files.find(presign.body?.fileId as string);
    if (file) w.storage.put(file.bucket, file.path, bytes);
    await w.call('POST', `${base}/photos/${presign.body?.fileId as string}/complete`, as(owner));
  }
  await w.call('PUT', `${base}/opening-hours`, {
    ...as(owner),
    body: { days: [{ weekday: 1, is24h: true }] },
  });
  await w.call('PUT', `${base}/rate-plans`, {
    ...as(owner),
    body: { product: 'DAILY', dailyRateKobo: 300_000 },
  });
  const presign = await w.call('POST', `${base}/permits/document`, {
    ...as(owner),
    body: { contentType: 'application/pdf', sizeBytes: pdf.length, sha256: sha(pdf) },
  });
  const permitFile = await w.store.files.find(presign.body?.fileId as string);
  if (permitFile) w.storage.put(permitFile.bucket, permitFile.path, pdf);
  await w.call('POST', `${base}/permits`, {
    ...as(owner),
    body: {
      permitNumber: 'LASPA/VI/2026/0012',
      issuedAt: '2026-01-10',
      expiresAt: '2027-01-09',
      fileId: presign.body?.fileId,
    },
  });
  await w.call('PUT', `/v1/operators/${operatorId}/payout-account`, {
    ...as(owner),
    body: { bankCode: '058', accountNumber: '0123456789' },
  });
  const submitted = await w.call('POST', `${base}/submit`, as(owner));
  expect(submitted.body?.status).toBe('PENDING_VERIFICATION');
  Object.assign(w.store.operatorRows.get(operatorId) ?? {}, {
    status: 'ACTIVE',
    kybStatus: 'APPROVED',
  });

  const ops = w.user([{ role: 'ADMIN_OPS', operatorId: null }], 'Ola');
  const ops2 = w.user([{ role: 'ADMIN_OPS', operatorId: null }], 'Tunde');
  const compliance = w.user([{ role: 'ADMIN_COMPLIANCE', operatorId: null }], 'Kemi');
  const permitId = w.store.permitRows[0]?.id as string;
  const ratePlanId = w.store.ratePlanRows[0]?.id as string;
  return { w, owner, operatorId, lotId, base, as, ops, ops2, compliance, permitId, ratePlanId };
}
type Ctx = Awaited<ReturnType<typeof pendingLot>>;

const approvePermit = (ctx: Ctx) =>
  ctx.w.call('POST', `/v1/admin/permits/${ctx.permitId}/review`, {
    ...ctx.as(ctx.compliance),
    body: { decision: 'APPROVE', note: 'Phoned LASPA VI office, ref 4471' },
  });
const approvePrice = (ctx: Ctx) =>
  ctx.w.call('POST', `/v1/admin/rate-plans/${ctx.ratePlanId}/review`, {
    ...ctx.as(ctx.ops),
    body: { decision: 'APPROVE' },
  });
async function approvedVisit(ctx: Ctx, capacityCounted = 280) {
  const visit = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
    ...ctx.as(ctx.ops),
    body: visitBody(capacityCounted),
  });
  return ctx.w.call('POST', `/v1/admin/verifications/${visit.body?.id as string}/review`, {
    ...ctx.as(ctx.ops),
    body: { decision: 'APPROVE' },
  });
}
const goLive = (ctx: Ctx, body: Record<string, unknown> = { status: 'LIVE' }) =>
  ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/status`, { ...ctx.as(ctx.ops), body });

describe('lot review queue and detail (X-02, doc 03 §4.1)', () => {
  it('lists lots waiting for verification with their operator', async () => {
    const ctx = await pendingLot();
    const res = await ctx.w.call('GET', '/v1/admin/lots', ctx.as(ctx.ops));
    expect(res.status).toBe(200);
    expect(res.body?.items).toEqual([
      expect.objectContaining({
        id: ctx.lotId,
        operatorName: 'Eko Hotels Ltd',
        status: 'PENDING_VERIFICATION',
        photoCount: 3,
      }),
    ]);
    const live = await ctx.w.call('GET', '/v1/admin/lots?status=LIVE', ctx.as(ctx.ops));
    expect(live.body?.items).toEqual([]);
  });

  it('shows the lot, photo links, permit, prices and what still blocks go-live', async () => {
    const ctx = await pendingLot();
    const res = await ctx.w.call('GET', `/v1/admin/lots/${ctx.lotId}`, ctx.as(ctx.compliance));
    expect(res.status).toBe(200);
    expect(res.body?.operator).toMatchObject({ legalName: 'Eko Hotels Ltd', status: 'ACTIVE' });
    expect(res.body?.photos).toHaveLength(3);
    expect((res.body?.photos as { url: string }[])[0]?.url).toMatch(/^https:\/\/storage\.fake\//);
    expect(res.body?.lot).toMatchObject({ permit: { status: 'SUBMITTED' } });
    expect(res.body?.listability).toEqual({
      listable: false,
      problems: ['PERMIT_NOT_APPROVED', 'VERIFICATION_MISSING', 'NO_ACTIVE_RATE_PLAN'],
    });
    expect(res.body?.fourEyesVerification).toBe(false);
    const missing = await ctx.w.call('GET', `/v1/admin/lots/${randomUUID()}`, ctx.as(ctx.ops));
    expect(missing.status).toBe(404);
  });
});

describe('permit review (X-04, FR-LOT-003, doc 03 §4.2)', () => {
  it('opens the scan through a 5-minute link, audited', async () => {
    const ctx = await pendingLot();
    const res = await ctx.w.call(
      'GET',
      `/v1/admin/permits/${ctx.permitId}/document-url`,
      ctx.as(ctx.compliance),
    );
    expect(res.status).toBe(200);
    expect(res.body?.expiresInSec).toBe(300);
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'permit.document_viewed' });
    const other = await ctx.w.call(
      'GET',
      `/v1/admin/permits/${randomUUID()}/document-url`,
      ctx.as(ctx.compliance),
    );
    expect(other.status).toBe(404);
  });

  it('approves with the LASPA check note, once', async () => {
    const ctx = await pendingLot();
    const res = await approvePermit(ctx);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'APPROVED' });
    expect(ctx.w.store.permitRows[0]?.reviewNote).toBe('Phoned LASPA VI office, ref 4471');
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({
      action: 'permit.approved',
      actorUserId: ctx.compliance,
    });
    const again = await approvePermit(ctx);
    expect([again.status, again.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });

  it('rejects with a reason the operator sees, and refuses to approve an expired permit', async () => {
    const ctx = await pendingLot();
    const permit = ctx.w.store.permitRows[0];
    if (permit) permit.expiresAt = '2026-10-19'; // TEST_NOW's Lagos date
    const expired = await approvePermit(ctx);
    expect([expired.status, expired.body?.code]).toEqual([422, 'PERMIT_EXPIRED']);
    const res = await ctx.w.call('POST', `/v1/admin/permits/${ctx.permitId}/review`, {
      ...ctx.as(ctx.compliance),
      body: { decision: 'REJECT', reason: 'Permit has expired; upload the renewal' },
    });
    expect(res.body).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Permit has expired; upload the renewal',
    });
    const lot = await ctx.w.call('GET', ctx.base, ctx.as(ctx.owner));
    expect(lot.body?.permit).toMatchObject({ status: 'REJECTED' });
  });
});

describe('price review (FR-LOT-005)', () => {
  it('makes the price live, audited with the amounts', async () => {
    const ctx = await pendingLot();
    const res = await approvePrice(ctx);
    expect(res.body).toMatchObject({ status: 'ACTIVE', dailyRateKobo: 300_000 });
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({
      action: 'rate_plan.approved',
      after: expect.objectContaining({ product: 'DAILY', dailyRateKobo: 300_000 }),
    });
  });

  it('rejects with a reason; compliance cannot decide prices', async () => {
    const ctx = await pendingLot();
    const denied = await ctx.w.call('POST', `/v1/admin/rate-plans/${ctx.ratePlanId}/review`, {
      ...ctx.as(ctx.compliance),
      body: { decision: 'APPROVE' },
    });
    expect(denied.status).toBe(403);
    const res = await ctx.w.call('POST', `/v1/admin/rate-plans/${ctx.ratePlanId}/review`, {
      ...ctx.as(ctx.ops),
      body: { decision: 'REJECT', reason: 'Above the area average; confirm' },
    });
    expect(res.body).toMatchObject({ status: 'REJECTED' });
    const again = await approvePrice(ctx);
    expect(again.status).toBe(409);
  });
});

describe('photo review (FR-LOT-002, doc 02 §2.4)', () => {
  it('copies an approved photo to the public bucket', async () => {
    const ctx = await pendingLot();
    const photo = ctx.w.store.photoRows[0];
    const res = await ctx.w.call('POST', `/v1/admin/lot-photos/${photo?.id as string}/review`, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect(res.body).toMatchObject({ status: 'APPROVED' });
    const publicId = ctx.w.store.photoRows[0]?.publicFileId as string;
    const copy = await ctx.w.store.files.find(publicId);
    expect(copy).toMatchObject({
      bucket: 'lot-photos-public',
      dataClass: 'C1',
      status: 'VERIFIED',
    });
    expect(ctx.w.storage.objects.has(`lot-photos-public/${copy?.path ?? ''}`)).toBe(true);
    const again = await ctx.w.call('POST', `/v1/admin/lot-photos/${photo?.id as string}/review`, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect(again.status).toBe(409);
  });

  it('rejects a photo without publishing it', async () => {
    const ctx = await pendingLot();
    const photo = ctx.w.store.photoRows[1];
    const res = await ctx.w.call('POST', `/v1/admin/lot-photos/${photo?.id as string}/review`, {
      ...ctx.as(ctx.compliance),
      body: { decision: 'REJECT', reason: 'Shows a car plate clearly' },
    });
    expect(res.body).toMatchObject({ status: 'REJECTED' });
    expect([...ctx.w.storage.objects.keys()].some((k) => k.startsWith('lot-photos-public/'))).toBe(
      false,
    );
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({
      action: 'lot.photo_rejected',
      after: { photoId: photo?.id, reason: 'Shows a car plate clearly' },
    });
  });
});

describe('site verification (X-03, FR-LOT-004, doc 03 §4.1)', () => {
  it('records the checklist, then approval applies a lower capacity count', async () => {
    const ctx = await pendingLot();
    const visit = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
      ...ctx.as(ctx.ops),
      body: visitBody(100),
    });
    expect(visit.status).toBe(201);
    expect(visit.body).toMatchObject({ status: 'SUBMITTED', validUntil: '2027-10-18' });
    const audit = ctx.w.store.auditRows.at(-1);
    expect(audit).toMatchObject({ action: 'lot.verification_recorded' });
    expect(JSON.stringify(audit)).not.toContain('6.4282');

    const second = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
      ...ctx.as(ctx.ops),
      body: visitBody(),
    });
    expect([second.status, second.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);

    const res = await ctx.w.call(
      'POST',
      `/v1/admin/verifications/${visit.body?.id as string}/review`,
      { ...ctx.as(ctx.ops2), body: { decision: 'APPROVE' } },
    );
    expect(res.body).toMatchObject({ status: 'APPROVED' });
    expect(ctx.w.store.lotRows.get(ctx.lotId)).toMatchObject({
      capacityTotal: 100,
      capacityBookable: 100,
    });
  });

  it('cannot approve a visit whose required checks failed (VERIFICATION_CHECKLIST_FAILED)', async () => {
    const ctx = await pendingLot();
    const visit = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
      ...ctx.as(ctx.ops),
      body: visitBody(280, ['LIGHTING']),
    });
    const url = `/v1/admin/verifications/${visit.body?.id as string}/review`;
    const res = await ctx.w.call('POST', url, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect([res.status, res.body?.code]).toEqual([422, 'VERIFICATION_CHECKLIST_FAILED']);
    expect(res.body?.errors).toEqual([{ path: 'LIGHTING', message: 'FAILED' }]);
    const rejected = await ctx.w.call('POST', url, {
      ...ctx.as(ctx.ops),
      body: { decision: 'REJECT', reason: 'No lighting at the back row' },
    });
    expect(rejected.body).toMatchObject({ status: 'REJECTED' });
  });

  it('with four-eyes on, the inspector cannot approve their own visit', async () => {
    const ctx = await pendingLot();
    ctx.w.store.flagRows.set('four_eyes_verification', true);
    const visit = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
      ...ctx.as(ctx.ops),
      body: visitBody(),
    });
    const url = `/v1/admin/verifications/${visit.body?.id as string}/review`;
    const own = await ctx.w.call('POST', url, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect([own.status, own.body?.code]).toEqual([403, 'FOUR_EYES_REQUIRED']);
    const other = await ctx.w.call('POST', url, {
      ...ctx.as(ctx.ops2),
      body: { decision: 'APPROVE' },
    });
    expect(other.status).toBe(200);
  });

  it('refuses a visit in the future, on a draft lot, or by compliance', async () => {
    const ctx = await pendingLot();
    const future = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
      ...ctx.as(ctx.ops),
      body: { ...visitBody(), inspectedAt: '2026-10-25T10:00:00.000Z' },
    });
    expect([future.status, future.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
    const byCompliance = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
      ...ctx.as(ctx.compliance),
      body: visitBody(),
    });
    expect(byCompliance.status).toBe(403);
    await ctx.w.store.lots.setStatus(
      ctx.operatorId,
      ctx.lotId,
      'PENDING_VERIFICATION',
      'DRAFT',
      'x',
    );
    const draft = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/verifications`, {
      ...ctx.as(ctx.ops),
      body: visitBody(),
    });
    expect(draft.status).toBe(409);
  });
});

describe('go-live and admin status moves (doc 02 §3.3, X-06)', () => {
  it('refuses go-live until the permit, visit and price are approved, listing what is missing', async () => {
    const ctx = await pendingLot();
    const early = await goLive(ctx);
    expect([early.status, early.body?.code]).toEqual([422, 'LOT_PERMIT_INVALID']);
    await approvePermit(ctx);
    const noVisit = await goLive(ctx);
    expect([noVisit.status, noVisit.body?.code]).toEqual([422, 'LOT_NOT_LISTABLE']);
    expect(noVisit.body?.errors).toEqual([
      { path: 'VERIFICATION_MISSING', message: 'VERIFICATION_MISSING' },
      { path: 'NO_ACTIVE_RATE_PLAN', message: 'NO_ACTIVE_RATE_PLAN' },
    ]);
  });

  it('puts a fully reviewed lot LIVE, audited, and the operator sees it', async () => {
    const ctx = await pendingLot();
    await approvePermit(ctx);
    await approvePrice(ctx);
    await approvedVisit(ctx);
    const res = await goLive(ctx);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'LIVE' });
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({
      action: 'lot.went_live',
      before: { status: 'PENDING_VERIFICATION' },
    });
    const own = await ctx.w.call('GET', ctx.base, ctx.as(ctx.owner));
    expect(own.body?.status).toBe('LIVE');
  });

  it('will not list a lot whose operator is not active', async () => {
    const ctx = await pendingLot();
    await approvePermit(ctx);
    await approvePrice(ctx);
    await approvedVisit(ctx);
    Object.assign(ctx.w.store.operatorRows.get(ctx.operatorId) ?? {}, { status: 'SUSPENDED' });
    const res = await goLive(ctx);
    expect(res.body?.errors).toEqual([
      { path: 'OPERATOR_NOT_ACTIVE', message: 'OPERATOR_NOT_ACTIVE' },
    ]);
  });

  it('sends a lot back to draft with a reason, and requires one', async () => {
    const ctx = await pendingLot();
    const bare = await goLive(ctx, { status: 'DRAFT' });
    expect([bare.status, bare.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
    const res = await goLive(ctx, { status: 'DRAFT', reason: 'Upload the renewed permit' });
    expect(res.body).toMatchObject({ status: 'DRAFT', statusReason: 'Upload the renewed permit' });
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'lot.sent_back' });
  });

  it('lets compliance suspend a live lot but only ops reinstate it', async () => {
    const ctx = await pendingLot();
    await approvePermit(ctx);
    await approvePrice(ctx);
    await approvedVisit(ctx);
    await goLive(ctx);
    const suspend = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/status`, {
      ...ctx.as(ctx.compliance),
      body: { status: 'SUSPENDED', reason: 'Safety incident reported' },
    });
    expect(suspend.body).toMatchObject({ status: 'SUSPENDED' });
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'lot.suspended' });
    const byCompliance = await ctx.w.call('POST', `/v1/admin/lots/${ctx.lotId}/status`, {
      ...ctx.as(ctx.compliance),
      body: { status: 'LIVE', reason: 'Resolved' },
    });
    expect([byCompliance.status, byCompliance.body?.code]).toEqual([403, 'FORBIDDEN']);
    const back = await goLive(ctx, { status: 'LIVE', reason: 'Incident resolved' });
    expect(back.body).toMatchObject({ status: 'LIVE' });
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'lot.reinstated' });
    const archive = await goLive(ctx, { status: 'ARCHIVED', reason: 'Operator closed the lot' });
    expect([archive.status, archive.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });
});
