import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

async function setup() {
  const w = world();
  const owner = w.user([], 'Ada');
  const as = (who: string, extra: { phone?: string; email?: string } = {}) => ({
    as: who,
    aal: 'aal2' as const,
    ...extra,
  });
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
      amenities: [],
      vehicleTypes: ['CAR'],
    },
  });
  const base = `/v1/operators/${operatorId}/members`;
  return { w, owner, operatorId, lotId: lot.body?.id as string, base, as };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const inviteManager = (ctx: Ctx, email = 'bisi@ekohotel.ng', by = ctx.owner) =>
  ctx.w.call('POST', ctx.base, {
    ...ctx.as(by),
    body: { role: 'MANAGER', name: 'Bisi Ade', email },
  });
const inviteAttendant = (ctx: Ctx, lotIds: string[] = [], by = ctx.owner) =>
  ctx.w.call('POST', ctx.base, {
    ...ctx.as(by),
    body: { role: 'ATTENDANT', name: 'Musa Bello', phone: '0805 555 1234', lotIds },
  });

describe('team invites (FR-OPS-004, doc 03 §2.3)', () => {
  it('lists the owner, then an invite with a 72-hour link token', async () => {
    const ctx = await setup();
    const list = await ctx.w.call('GET', ctx.base, ctx.as(ctx.owner));
    expect(list.body?.items).toEqual([
      expect.objectContaining({ role: 'OWNER', status: 'ACTIVE', name: 'Ada' }),
    ]);
    const res = await inviteManager(ctx);
    expect(res.status).toBe(201);
    expect(res.body?.inviteToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body?.member).toMatchObject({
      role: 'MANAGER',
      status: 'INVITED',
      name: 'Bisi Ade',
      inviteExpiresAt: '2026-10-22T08:00:00.000Z',
    });
    const audit = ctx.w.store.auditRows.at(-1);
    expect(audit).toMatchObject({ action: 'member.invited' });
    expect(JSON.stringify(audit)).not.toMatch(/bisi|Bisi/);
    expect(JSON.stringify(ctx.w.store.memberRows)).not.toContain('bisi@ekohotel.ng');
  });

  it('refuses a second invite for the same person (MEMBER_EXISTS)', async () => {
    const ctx = await setup();
    await inviteManager(ctx);
    const again = await inviteManager(ctx, 'BISI@ekohotel.ng');
    expect([again.status, again.body?.code]).toEqual([409, 'MEMBER_EXISTS']);
  });

  it('lets a manager invite attendants but not managers (FORBIDDEN_ROLE_GRANT)', async () => {
    const ctx = await setup();
    const manager = ctx.w.user([{ role: 'OPERATOR_MANAGER', operatorId: ctx.operatorId }]);
    const mgr = await inviteManager(ctx, 'other@ekohotel.ng', manager);
    expect([mgr.status, mgr.body?.code]).toEqual([403, 'FORBIDDEN_ROLE_GRANT']);
    const att = await inviteAttendant(ctx, [], manager);
    expect(att.status).toBe(201);
  });

  it('checks the phone number and that the lots belong to the business', async () => {
    const ctx = await setup();
    const badPhone = await ctx.w.call('POST', ctx.base, {
      ...ctx.as(ctx.owner),
      body: { role: 'ATTENDANT', name: 'Musa', phone: '+44 7700 900123' },
    });
    expect([badPhone.status, badPhone.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
    const other = await setup();
    const badLot = await inviteAttendant(ctx, [other.lotId]);
    expect(badLot.body?.errors).toEqual([
      { path: 'lotIds', message: 'Pick lots of this business.' },
    ]);
  });

  it('hides another operator’s team (404)', async () => {
    const a = await setup();
    const b = await setup();
    const res = await b.w.call('GET', a.base, b.as(b.owner));
    expect(res.status).toBe(404);
  });
});

describe('accepting an invite (doc 02 /auth/invites/accept)', () => {
  it('joins the invited email as manager, once', async () => {
    const ctx = await setup();
    const invite = await inviteManager(ctx);
    const bisi = ctx.w.user([], 'Bisi');
    const accept = () =>
      ctx.w.call('POST', '/v1/auth/invites/accept', {
        ...ctx.as(bisi, { email: 'bisi@ekohotel.ng' }),
        body: { inviteToken: invite.body?.inviteToken },
      });
    const res = await accept();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ operatorId: ctx.operatorId, role: 'MANAGER' });
    expect(await ctx.w.store.users.roles(bisi)).toEqual([
      { role: 'OPERATOR_MANAGER', operatorId: ctx.operatorId },
    ]);
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'member.invite_accepted' });
    const again = await accept();
    expect([again.status, again.body?.code]).toEqual([422, 'INVITE_INVALID']);
    const team = await ctx.w.call('GET', ctx.base, ctx.as(ctx.owner));
    expect(team.body?.items).toContainEqual(
      expect.objectContaining({ role: 'MANAGER', status: 'ACTIVE', name: 'Bisi' }),
    );
  });

  it('refuses someone else signing in with the link, and an expired link', async () => {
    const ctx = await setup();
    const invite = await inviteManager(ctx);
    const stranger = ctx.w.user([]);
    const wrong = await ctx.w.call('POST', '/v1/auth/invites/accept', {
      ...ctx.as(stranger, { email: 'someone@else.ng' }),
      body: { inviteToken: invite.body?.inviteToken },
    });
    expect([wrong.status, wrong.body?.code]).toEqual([422, 'INVITE_INVALID']);
    const row = ctx.w.store.memberRows.find((m) => m.role === 'MANAGER');
    if (row) row.inviteExpiresAt = new Date('2026-10-19T07:59:00Z');
    const bisi = ctx.w.user([]);
    const late = await ctx.w.call('POST', '/v1/auth/invites/accept', {
      ...ctx.as(bisi, { email: 'bisi@ekohotel.ng' }),
      body: { inviteToken: invite.body?.inviteToken },
    });
    expect([late.status, late.body?.code]).toEqual([422, 'INVITE_EXPIRED']);
  });

  it('scopes an attendant to the lots on the invite', async () => {
    const ctx = await setup();
    const invite = await inviteAttendant(ctx, [ctx.lotId]);
    const musa = ctx.w.user([]);
    const res = await ctx.w.call('POST', '/v1/auth/invites/accept', {
      ...ctx.as(musa, { phone: '+2348055551234' }),
      body: { inviteToken: invite.body?.inviteToken },
    });
    expect(res.body).toMatchObject({ role: 'ATTENDANT' });
    expect(await ctx.w.store.members.attendantLotIds(musa)).toEqual([ctx.lotId]);
  });

  it('refuses the owner joining their own business again (MEMBER_EXISTS)', async () => {
    const ctx = await setup();
    const invite = await inviteManager(ctx, 'ada@ekohotel.ng');
    const res = await ctx.w.call('POST', '/v1/auth/invites/accept', {
      ...ctx.as(ctx.owner, { email: 'ada@ekohotel.ng' }),
      body: { inviteToken: invite.body?.inviteToken },
    });
    expect([res.status, res.body?.code]).toEqual([409, 'MEMBER_EXISTS']);
  });
});

describe('removing a member', () => {
  it('removes an active member, their role and sessions; only the owner may', async () => {
    const ctx = await setup();
    const invite = await inviteManager(ctx);
    const bisi = ctx.w.user([]);
    await ctx.w.call('POST', '/v1/auth/invites/accept', {
      ...ctx.as(bisi, { email: 'bisi@ekohotel.ng' }),
      body: { inviteToken: invite.body?.inviteToken },
    });
    const memberId = (invite.body?.member as { id: string }).id;
    const byManager = await ctx.w.call('DELETE', `${ctx.base}/${memberId}`, ctx.as(bisi));
    expect(byManager.status).toBe(403);
    const res = await ctx.w.call('DELETE', `${ctx.base}/${memberId}`, ctx.as(ctx.owner));
    expect(res.status).toBe(200);
    expect(await ctx.w.store.users.roles(bisi)).toEqual([]);
    expect(ctx.w.store.revokedSessionUsers).toContain(bisi);
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'member.removed' });
    const gone = await ctx.w.call('DELETE', `${ctx.base}/${memberId}`, ctx.as(ctx.owner));
    expect(gone.status).toBe(404);
  });

  it('cancels an open invite, and never removes the owner', async () => {
    const ctx = await setup();
    const invite = await inviteAttendant(ctx);
    const memberId = (invite.body?.member as { id: string }).id;
    const res = await ctx.w.call('DELETE', `${ctx.base}/${memberId}`, ctx.as(ctx.owner));
    expect(res.status).toBe(200);
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'member.invite_cancelled' });
    const ownerRow = ctx.w.store.memberRows.find((m) => m.role === 'OWNER');
    const own = await ctx.w.call('DELETE', `${ctx.base}/${ownerRow?.id ?? ''}`, ctx.as(ctx.owner));
    expect([own.status, own.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });
});

describe('invite preview (doc 03 §2.3 step 2)', () => {
  const preview = (ctx: Ctx, inviteToken: unknown, ip = '203.0.113.7') =>
    ctx.w.call('POST', '/v1/invites/preview', {
      body: { inviteToken },
      headers: { 'x-forwarded-for': ip },
    });

  it('tells anyone with the link the business and role, without signing in', async () => {
    const ctx = await setup();
    const manager = await inviteManager(ctx);
    expect((await preview(ctx, manager.body?.inviteToken)).body).toEqual({
      state: 'OPEN',
      role: 'MANAGER',
      businessName: 'Eko Hotel',
      expiresAt: '2026-10-22T08:00:00.000Z',
    });
    const attendant = await inviteAttendant(ctx);
    expect((await preview(ctx, attendant.body?.inviteToken)).body).toMatchObject({
      state: 'OPEN',
      role: 'ATTENDANT',
    });
  });

  it('reports expired links, and the same INVALID for unknown, used or cancelled ones', async () => {
    const ctx = await setup();
    const invite = await inviteManager(ctx);
    const token = invite.body?.inviteToken;
    const row = ctx.w.store.memberRows.find((m) => m.role === 'MANAGER');
    if (row) row.inviteExpiresAt = new Date('2026-10-19T07:00:00Z');
    expect((await preview(ctx, token)).body).toEqual({
      state: 'EXPIRED',
      businessName: 'Eko Hotel',
    });
    expect((await preview(ctx, 'x'.repeat(43))).body).toEqual({ state: 'INVALID' });
    await ctx.w.call(
      'DELETE',
      `${ctx.base}/${(invite.body?.member as { id: string }).id}`,
      ctx.as(ctx.owner),
    );
    expect((await preview(ctx, token)).body).toEqual({ state: 'INVALID' });
    expect((await preview(ctx, 'not a token')).status).toBe(400);
  });

  it('is rate limited per IP', async () => {
    const ctx = await setup();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await preview(ctx, 'x'.repeat(43), '198.51.100.9')).status;
    expect(last).toBe(429);
  });
});
