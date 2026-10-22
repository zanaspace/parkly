import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { FakeEmailProvider } from '../providers/fakes.js';
import { MemoryStore } from '../store/memory.js';
import type { LotRow } from '../store/types.js';
import { TEST_JOB_SECRET, testApp } from '../test-helpers.js';
import { permitExpiryJob } from './permit-expiry.js';
import { signJobRequest } from './signature.js';

const at = (iso: string) => new Date(`${iso}T06:00:00+01:00`);
const deadline = new Date('2100-01-01T00:00:00Z');

async function setup(opts: { status?: LotRow['status']; expiresAt?: string } = {}) {
  const store = new MemoryStore();
  const email = new FakeEmailProvider();
  let clock = at('2026-10-19');
  const operatorId = randomUUID();
  store.operatorRows.set(operatorId, {
    id: operatorId,
    legalName: 'Eko Hotels Ltd',
    tradingName: 'Eko Hotel',
    type: 'HOTEL',
    cacNumberEnc: null,
    tinEnc: null,
    addressLine: null,
    contactEmail: 'ops@ekohotel.ng',
    contactPhoneEnc: null,
    status: 'ACTIVE',
    kybStatus: 'APPROVED',
    kybSubmittedAt: null,
    kybRejectionReason: null,
    commissionBps: 1200,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  });
  const lotId = randomUUID();
  store.lotRows.set(lotId, {
    id: lotId,
    operatorId,
    slug: 'eko-hotel-car-park',
    type: 'HOTEL',
    name: 'Eko Hotel Car Park',
    description: null,
    addressLine: 'Victoria Island',
    area: null,
    lga: null,
    location: { lat: 6.4281, lng: 3.4219 },
    entranceNotes: null,
    capacityTotal: 300,
    capacityBookable: 120,
    amenities: [],
    vehicleTypes: ['CAR'],
    status: opts.status ?? 'LIVE',
    statusReason: null,
    selfCheckinEnabled: false,
    version: 3,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  });
  const addPermit = async (expiresAt: string) => {
    const p = await store.permits.create({
      lotId,
      permitNumber: `LASPA/VI/${expiresAt}`,
      issuedAt: '2026-01-10',
      expiresAt,
      documentFileId: randomUUID(),
      submittedBy: randomUUID(),
    });
    await store.permits.approve(p.id, { reviewerId: randomUUID(), at: clock, note: 'checked' });
    return p.id;
  };
  const permitId = await addPermit(opts.expiresAt ?? '2026-11-18');
  const make = (allowTimeTravel = false) =>
    permitExpiryJob({
      store,
      email,
      logger: createLogger({ level: 'silent' }),
      now: () => clock,
      allowTimeTravel,
    });
  return {
    store,
    email,
    lotId,
    permitId,
    addPermit,
    job: make(),
    timeTravelJob: make(true),
    setDay: (iso: string) => (clock = at(iso)),
  };
}

const run = (job: ReturnType<typeof permitExpiryJob>, payload: unknown = {}) =>
  job({ payload, deadline });

describe('permit expiry job (FR-LOT-007, doc 01 §5.8)', () => {
  it('sends the 30-day reminder once, then the 14-day one', async () => {
    const ctx = await setup(); // expires 2026-11-18, 30 days after 2026-10-19
    expect(await run(ctx.job)).toEqual({ processed: 1, remaining: 0 });
    expect(ctx.email.sent).toEqual([
      expect.objectContaining({
        to: 'ops@ekohotel.ng',
        subject: 'Your LASPA permit for Eko Hotel Car Park expires in 30 days',
      }),
    ]);
    expect(await run(ctx.job)).toEqual({ processed: 0, remaining: 0 });
    ctx.setDay('2026-11-04'); // 14 days left
    await run(ctx.job);
    expect(ctx.email.sent.map((e) => e.subject)).toEqual([
      'Your LASPA permit for Eko Hotel Car Park expires in 30 days',
      'Your LASPA permit for Eko Hotel Car Park expires in 14 days',
    ]);
  });

  it('a missed run sends only the nearest reminder, not a burst', async () => {
    const ctx = await setup();
    ctx.setDay('2026-11-12'); // 6 days left, nothing sent yet
    await run(ctx.job);
    expect(ctx.email.sent.map((e) => e.subject)).toEqual([
      'Your LASPA permit for Eko Hotel Car Park expires in 7 days',
    ]);
  });

  it('on the expiry date expires the permit and suspends the live lot, audited as system', async () => {
    const ctx = await setup();
    ctx.setDay('2026-11-18');
    expect(await run(ctx.job)).toEqual({ processed: 1, remaining: 0 });
    expect((await ctx.store.permits.find(ctx.permitId))?.status).toBe('EXPIRED');
    expect(ctx.store.lotRows.get(ctx.lotId)).toMatchObject({
      status: 'SUSPENDED',
      statusReason: expect.stringContaining('LASPA permit expired'),
    });
    expect(ctx.store.auditRows.map((a) => [a.action, a.actorRole, a.actorUserId])).toEqual([
      ['permit.expired', 'SYSTEM', null],
      ['lot.suspended', 'SYSTEM', null],
    ]);
    expect(ctx.email.sent.at(-1)?.subject).toBe(
      'Eko Hotel Car Park is suspended: LASPA permit expired',
    );
    expect(await run(ctx.job)).toEqual({ processed: 0, remaining: 0 });
    expect(ctx.store.auditRows).toHaveLength(2);
  });

  it('keeps the lot live when a renewal is already approved', async () => {
    const ctx = await setup();
    await ctx.addPermit('2027-11-18');
    ctx.setDay('2026-11-18');
    await run(ctx.job);
    expect((await ctx.store.permits.find(ctx.permitId))?.status).toBe('EXPIRED');
    expect(ctx.store.lotRows.get(ctx.lotId)?.status).toBe('LIVE');
    expect(ctx.email.sent).toEqual([]);
  });

  it('does not remind about a permit that a newer one replaced', async () => {
    const ctx = await setup();
    await ctx.addPermit('2027-11-18');
    await run(ctx.job);
    expect(ctx.email.sent).toEqual([]);
    expect((await ctx.store.permits.find(ctx.permitId))?.lastReminderDays).toBe(30);
  });

  it('leaves lots that are not live or paused in their status', async () => {
    const ctx = await setup({ status: 'PENDING_VERIFICATION' });
    ctx.setDay('2026-11-20');
    await run(ctx.job);
    expect((await ctx.store.permits.find(ctx.permitId))?.status).toBe('EXPIRED');
    expect(ctx.store.lotRows.get(ctx.lotId)?.status).toBe('PENDING_VERIFICATION');
  });

  it('fast-forwards with asOf only where time travel is allowed (S2 demo)', async () => {
    const ctx = await setup();
    await run(ctx.job, { asOf: '2026-12-01' });
    expect(ctx.store.lotRows.get(ctx.lotId)?.status).toBe('LIVE');
    await run(ctx.timeTravelJob, { asOf: '2026-12-01' });
    expect(ctx.store.lotRows.get(ctx.lotId)?.status).toBe('SUSPENDED');
  });

  it('runs through the signed /internal/jobs endpoint', async () => {
    const ctx = await setup();
    const nowSec = Math.floor(at('2026-10-19').getTime() / 1000);
    const body = '{}';
    const res = await testApp({
      jobs: { 'permit-expiry-check': ctx.job },
      now: () => at('2026-10-19'),
    }).request('/internal/jobs/permit-expiry-check', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-parkly-job-id': 'call-1',
        'x-parkly-job-timestamp': String(nowSec),
        'x-parkly-job-signature': signJobRequest({
          secret: TEST_JOB_SECRET,
          job: 'permit-expiry-check',
          timestamp: nowSec,
          body,
        }),
      },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ processed: 1, remaining: 0 });
  });
});
