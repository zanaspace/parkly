import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { addLiveLot, TEST_NOW, world } from '../../test-helpers.js';

type Role = 'ADMIN_SUPPORT' | 'ADMIN_OPS' | 'ADMIN_FINANCE';

async function setup(overrides: Parameters<typeof world>[0] = {}) {
  const w = world(overrides);
  const { lot } = await addLiveLot(w.store);
  const { lot: otherLot } = await addLiveLot(w.store);
  const staff = (role: Role = 'ADMIN_SUPPORT') => ({
    as: w.user([{ role, operatorId: null }], role),
    aal: 'aal2' as const,
  });
  const support = staff('ADMIN_SUPPORT');
  const body = (over: Record<string, unknown> = {}) => ({
    lotId: lot.id,
    category: 'ACCESS_DENIED',
    severity: 'HIGH',
    description: 'Attendant says the driver is not booked',
    ...over,
  });
  const log = (over: Record<string, unknown> = {}, who = support) =>
    w.call('POST', '/v1/admin/incidents', { ...who, body: body(over) });
  const act = (id: string, b: Record<string, unknown>, who = support) =>
    w.call('PATCH', `/v1/admin/incidents/${id}`, { ...who, body: b });
  return { w, lot, otherLot, staff, support, body, log, act };
}

const at = (iso: string) => () => new Date(iso);

describe('logging an incident (FR-INC-001)', () => {
  it('opens it against a lot, shows S-level and the response deadline, and audits it', async () => {
    const t = await setup();
    const res = await t.log();
    expect(res.status).toBe(201);
    expect(res.body?.lotFlaggedForReview).toBe(false);
    expect(res.body?.incident).toMatchObject({
      lotId: t.lot.id,
      lotName: 'Eko Hotel Car Park',
      status: 'OPEN',
      category: 'ACCESS_DENIED',
      severity: 'HIGH',
      severityLabel: 'S2',
      reporterRole: 'ADMIN_SUPPORT',
      assigneeId: null,
      overdue: false,
      // HIGH: one hour from TEST_NOW.
      triageDueAt: new Date(TEST_NOW.getTime() + 60 * 60_000).toISOString(),
    });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'incident.created',
      entityType: 'incident',
      entityId: (res.body?.incident as { id: string }).id,
    });
  });

  it('links a booking only when it is at the same lot', async () => {
    const t = await setup();
    const driver = t.w.user([{ role: 'DRIVER', operatorId: null }], 'Ada');
    const vehicle = await t.w.store.vehicles.create({
      userId: driver,
      plateRaw: 'LND 123 AB',
      plateNorm: 'LND123AB',
      make: null,
      model: null,
      colour: null,
      isDefault: true,
    });
    const created = await t.w.call('POST', '/v1/bookings', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: {
        lotId: t.lot.id,
        vehicleId: vehicle.id,
        startAt: '2026-10-19T09:00:00.000Z',
        endAt: '2026-10-19T11:00:00.000Z',
      },
    });
    const booking = created.body?.booking as { id: string; code: string };

    const ok = await t.log({ bookingId: booking.id });
    expect(ok.status).toBe(201);
    expect(ok.body?.incident).toMatchObject({ bookingId: booking.id, bookingCode: booking.code });

    const wrongLot = await t.log({ lotId: t.otherLot.id, bookingId: booking.id });
    expect(wrongLot.status).toBe(400);
    expect(wrongLot.body?.code).toBe('VALIDATION_FAILED');
    expect((await t.log({ bookingId: randomUUID() })).status).toBe(400);
  });

  it('rejects an unknown lot, a thin description and a role that cannot log', async () => {
    const t = await setup();
    expect((await t.log({ lotId: randomUUID() })).status).toBe(404);
    expect((await t.log({ description: 'too short' })).status).toBe(400);
    expect((await t.log({ severity: 'URGENT' })).status).toBe(400);
    expect((await t.log({}, t.staff('ADMIN_FINANCE'))).status).toBe(403);
  });
});

describe('escalation (FR-INC-004)', () => {
  it('pages on-call for a critical incident only, and still logs it if the page fails', async () => {
    const page = vi.fn().mockResolvedValue(undefined);
    const t = await setup({ pageOnCall: page });
    await t.log({ severity: 'HIGH' });
    expect(page).not.toHaveBeenCalled();

    const res = await t.log({ severity: 'CRITICAL', category: 'SAFETY' });
    expect(res.status).toBe(201);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith({
      incidentId: (res.body?.incident as { id: string }).id,
      lotName: 'Eko Hotel Car Park',
      category: 'SAFETY',
    });

    page.mockRejectedValueOnce(new Error('pager down'));
    const failed = await t.log({ severity: 'CRITICAL' });
    expect(failed.status).toBe(201);
    expect((await t.w.store.incidents.list({ limit: 10 })).length).toBe(3);
  });

  it('pages through the default hook (an error log) when none is set', async () => {
    const t = await setup();
    const res = await t.log({ severity: 'CRITICAL' });
    expect(res.status).toBe(201);
  });

  it('flags the lot on the third incident in 30 days, once, and lists it', async () => {
    const t = await setup();
    const flags = () => t.w.call('GET', '/v1/admin/incidents/lot-flags', t.support);
    expect((await flags()).body?.items).toEqual([]);

    expect((await t.log()).body?.lotFlaggedForReview).toBe(false);
    expect((await t.log()).body?.lotFlaggedForReview).toBe(false);
    expect((await flags()).body?.items).toEqual([]);

    const third = await t.log();
    expect(third.body?.lotFlaggedForReview).toBe(true);
    expect(t.w.store.auditRows.filter((a) => a.action === 'lot.flagged_for_review')).toEqual([
      expect.objectContaining({ entityType: 'lot', entityId: t.lot.id }),
    ]);
    expect((await t.log()).body?.lotFlaggedForReview).toBe(false);
    // Another lot's incidents are counted on their own.
    await t.log({ lotId: t.otherLot.id });

    expect((await flags()).body?.items).toEqual([
      {
        lotId: t.lot.id,
        lotName: 'Eko Hotel Car Park',
        operatorName: 'Eko Parking',
        incidentCount: 4,
        windowDays: 30,
      },
    ]);
  });

  it('counts only the last 30 days', async () => {
    const t = await setup();
    await t.log();
    await t.log();
    await t.log();
    // 31 days later the three have dropped out of the window.
    t.w.deps.now = at('2026-11-19T09:00:00Z');
    expect((await t.w.call('GET', '/v1/admin/incidents/lot-flags', t.support)).body?.items).toEqual(
      [],
    );
    expect((await t.log()).body?.lotFlaggedForReview).toBe(false);
  });
});

describe('the incident queue', () => {
  it('lists worst severity first, then oldest, with overdue marked, and filters', async () => {
    const t = await setup();
    const low = await t.log({ severity: 'LOW' });
    const critical = await t.log({ severity: 'CRITICAL', category: 'THEFT' });
    const high = await t.log({ severity: 'HIGH' });
    const ids = (r: { body: Record<string, unknown> | null }) =>
      (r.body?.items as { id: string }[]).map((i) => i.id);
    const id = (r: { body: Record<string, unknown> | null }) =>
      (r.body?.incident as { id: string }).id;

    // 20 minutes on: the critical one's 15 minutes are up; the others are not.
    t.w.deps.now = at(new Date(TEST_NOW.getTime() + 20 * 60_000).toISOString());
    const list = await t.w.call('GET', '/v1/admin/incidents', t.support);
    expect(ids(list)).toEqual([id(critical), id(high), id(low)]);
    expect(
      (list.body?.items as { id: string; overdue: boolean }[]).map((i) => [i.id, i.overdue]),
    ).toEqual([
      [id(critical), true],
      [id(high), false],
      [id(low), false],
    ]);

    expect(ids(await t.w.call('GET', '/v1/admin/incidents?severity=LOW', t.support))).toEqual([
      id(low),
    ]);
    expect(
      ids(await t.w.call('GET', `/v1/admin/incidents?lotId=${t.otherLot.id}`, t.support)),
    ).toEqual([]);
    expect(ids(await t.w.call('GET', '/v1/admin/incidents?status=TRIAGED', t.support))).toEqual([]);
  });
});

describe('working an incident (doc 02 §3.6)', () => {
  it('triages, resolves, closes, with a reason in the audit log at each step', async () => {
    const t = await setup();
    const opened = await t.log();
    const id = (opened.body?.incident as { id: string }).id;
    const ops = t.staff('ADMIN_OPS');

    const triaged = await t.act(id, { action: 'TRIAGE' }, ops);
    expect(triaged.status).toBe(200);
    // With no one named, the person triaging owns it.
    expect(triaged.body).toMatchObject({
      status: 'TRIAGED',
      assigneeId: ops.as,
      triagedAt: TEST_NOW.toISOString(),
    });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'incident.triaged',
      before: { status: 'OPEN' },
      after: { status: 'TRIAGED', assigneeId: ops.as },
    });

    const resolved = await t.act(id, { action: 'RESOLVE', resolution: 'Ticket resent' });
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolution: 'Ticket resent' });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'incident.resolved',
      after: { status: 'RESOLVED', resolution: 'Ticket resent' },
    });

    const closed = await t.act(id, { action: 'CLOSE' });
    expect(closed.body).toMatchObject({ status: 'CLOSED', closedAt: TEST_NOW.toISOString() });
    expect(t.w.store.auditRows.at(-1)?.action).toBe('incident.closed');
  });

  it('assigns to someone else when named', async () => {
    const t = await setup();
    const id = ((await t.log()).body?.incident as { id: string }).id;
    const other = t.staff('ADMIN_OPS').as;
    const res = await t.act(id, { action: 'TRIAGE', assigneeId: other });
    expect(res.body).toMatchObject({ status: 'TRIAGED', assigneeId: other });
  });

  it('refuses steps out of order, and a resolution that says nothing', async () => {
    const t = await setup();
    const id = ((await t.log()).body?.incident as { id: string }).id;
    for (const b of [{ action: 'RESOLVE', resolution: 'Fixed it' }, { action: 'CLOSE' }]) {
      const res = await t.act(id, b);
      expect(res.status, JSON.stringify(b)).toBe(409);
      expect(res.body?.code).toBe('INVALID_STATE_TRANSITION');
    }
    expect((await t.act(id, { action: 'TRIAGE' })).status).toBe(200);
    expect((await t.act(id, { action: 'TRIAGE' })).status).toBe(409);
    expect((await t.act(id, { action: 'RESOLVE', resolution: 'ok' })).status).toBe(400);
    expect((await t.act(id, { action: 'REOPEN', reason: 'because' })).status).toBe(409);
    expect((await t.act(id, { action: 'NOPE' })).status).toBe(400);
    expect((await t.act(randomUUID(), { action: 'TRIAGE' })).status).toBe(404);
  });

  it('reopens a resolved incident within 7 days, noting why, and not after', async () => {
    const t = await setup();
    const id = ((await t.log()).body?.incident as { id: string }).id;
    await t.act(id, { action: 'TRIAGE' });
    await t.act(id, { action: 'RESOLVE', resolution: 'Barrier repaired' });

    t.w.deps.now = at('2026-10-24T09:00:00Z');
    const reopened = await t.act(id, { action: 'REOPEN', reason: 'It broke again' });
    expect(reopened.body).toMatchObject({ status: 'OPEN', resolvedAt: null, overdue: false });
    const detail = await t.w.call('GET', `/v1/admin/incidents/${id}`, t.support);
    expect(detail.body?.notes).toEqual([
      expect.objectContaining({ body: 'Reopened: It broke again' }),
    ]);

    await t.act(id, { action: 'TRIAGE' });
    await t.act(id, { action: 'RESOLVE', resolution: 'Replaced the arm' });
    // 8 days after that resolution.
    t.w.deps.now = at('2026-11-02T09:00:00Z');
    const late = await t.act(id, { action: 'REOPEN', reason: 'Still stuck' });
    expect(late.status).toBe(409);
    expect(late.body?.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('keeps notes in order, audits them, and stops at closed', async () => {
    const t = await setup();
    const id = ((await t.log()).body?.incident as { id: string }).id;
    const note = (body: string) =>
      t.w.call('POST', `/v1/admin/incidents/${id}/notes`, { ...t.support, body: { body } });

    const first = await note('Called the attendant');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: 'Called the attendant', authorId: t.support.as });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'incident.note_added',
      entityId: id,
    });
    await note('Operator confirmed the fault');
    expect((await note('x')).status).toBe(400);

    const detail = await t.w.call('GET', `/v1/admin/incidents/${id}`, t.support);
    expect((detail.body?.notes as { body: string }[]).map((n) => n.body)).toEqual([
      'Called the attendant',
      'Operator confirmed the fault',
    ]);
    // Not shown: who the reporter is, beyond their role.
    expect(JSON.stringify(detail.body)).not.toContain('reporterUserId');

    await t.act(id, { action: 'TRIAGE' });
    await t.act(id, { action: 'RESOLVE', resolution: 'Handled by operator' });
    await t.act(id, { action: 'CLOSE' });
    const closed = await note('One more thing');
    expect(closed.status).toBe(409);
    expect((await t.w.call('GET', `/v1/admin/incidents/${randomUUID()}`, t.support)).status).toBe(
      404,
    );
  });
});
