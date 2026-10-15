import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

const V = '2026-10-01';

describe('profile and consents (FR-AUTH-002)', () => {
  it('requires sign-in', async () => {
    expect((await world().call('GET', '/v1/me')).status).toBe(401);
  });

  it('asks for completion until name, Terms and Privacy are given', async () => {
    const w = world();
    const id = w.user();
    let me = await w.call('GET', '/v1/me', { as: id });
    expect(me.body).toMatchObject({
      profileComplete: false,
      currentLegalVersions: { terms: V, privacy: V },
    });

    await w.call('PATCH', '/v1/me', { as: id, body: { firstName: 'Adaeze', lastName: 'Okafor' } });
    await w.call('POST', '/v1/me/consents', {
      as: id,
      body: { type: 'TERMS', version: V, granted: true },
    });
    me = await w.call('POST', '/v1/me/consents', {
      as: id,
      body: { type: 'PRIVACY', version: V, granted: true },
    });
    expect(me.body).toMatchObject({
      firstName: 'Adaeze',
      profileComplete: true,
      consents: { termsVersion: V, privacyVersion: V, marketing: false },
    });
  });

  it('Scenario: marketing consent is optional, off by default, and each decision is stored', async () => {
    const w = world();
    const id = w.user();
    await w.call('POST', '/v1/me/consents', {
      as: id,
      body: { type: 'MARKETING', version: V, granted: true },
    });
    const me = await w.call('POST', '/v1/me/consents', {
      as: id,
      body: { type: 'MARKETING', version: V, granted: false },
    });
    expect(me.body).toMatchObject({ consents: { marketing: false } });
    expect(w.store.consentRows.filter((c) => c.userId === id)).toHaveLength(2);
  });

  it('treats acceptance of an old Terms version as incomplete', async () => {
    const w = world();
    const id = w.user([{ role: 'DRIVER', operatorId: null }], 'Ada');
    await w.call('POST', '/v1/me/consents', {
      as: id,
      body: { type: 'TERMS', version: '2025-01-01', granted: true },
    });
    await w.call('POST', '/v1/me/consents', {
      as: id,
      body: { type: 'PRIVACY', version: V, granted: true },
    });
    expect((await w.call('GET', '/v1/me', { as: id })).body).toMatchObject({
      profileComplete: false,
    });
  });

  it('validates names', async () => {
    const w = world();
    const res = await w.call('PATCH', '/v1/me', {
      as: w.user(),
      body: { firstName: 'Ada<script>' },
    });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('VALIDATION_FAILED');
  });
});

describe('devices', () => {
  it('stores push tokens encrypted', async () => {
    const w = world();
    const id = w.user();
    const res = await w.call('POST', '/v1/me/devices', {
      as: id,
      body: { deviceId: randomUUID(), platform: 'ANDROID', pushToken: 'ExponentPushToken[secret]' },
    });
    expect(res.status).toBe(204);
    const stored = w.store.deviceRows[0]?.pushTokenEnc ?? '';
    expect(stored).not.toContain('secret');
    expect(w.deps.crypto.decrypt(stored)).toBe('ExponentPushToken[secret]');
  });
});

describe('account deletion (FR-AUTH-007)', () => {
  it('opens a deletion request, marks the account and writes an audit row', async () => {
    const w = world();
    const id = w.user();
    const res = await w.call('DELETE', '/v1/me', { as: id });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'PENDING_DELETION' });
    expect(w.store.userRows.get(id)?.status).toBe('PENDING_DELETION');
    expect(w.store.auditRows).toMatchObject([
      { action: 'user.deletion_requested', entityId: id, actorUserId: id },
    ]);
    expect(w.store.dsrRows[0]?.dueAt.toISOString()).toBe('2026-11-18T08:00:00.000Z');
  });

  it('refuses a second open request', async () => {
    const w = world();
    const id = w.user();
    await w.call('DELETE', '/v1/me', { as: id });
    const res = await w.call('DELETE', '/v1/me', { as: id });
    expect(res.status).toBe(409);
    expect(res.body?.code).toBe('DSR_ALREADY_OPEN');
  });
});

describe('vehicles (FR-AUTH-003)', () => {
  it('Scenario: add vehicle with plate normalisation; no duplicates', async () => {
    const w = world();
    const id = w.user();
    const res = await w.call('POST', '/v1/me/vehicles', {
      as: id,
      body: { plate: 'lnd 123-ab', make: 'Toyota' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      plate: 'lnd 123-ab',
      plateNorm: 'LND123AB',
      make: 'Toyota',
      isDefault: true,
    });

    const dup = await w.call('POST', '/v1/me/vehicles', { as: id, body: { plate: 'LND-123-AB' } });
    expect(dup.status).toBe(409);
    expect(dup.body?.code).toBe('VEHICLE_DUPLICATE');
  });

  it('lets two different drivers register the same plate', async () => {
    const w = world();
    expect(
      (await w.call('POST', '/v1/me/vehicles', { as: w.user(), body: { plate: 'KJA456XY' } }))
        .status,
    ).toBe(201);
    expect(
      (await w.call('POST', '/v1/me/vehicles', { as: w.user(), body: { plate: 'KJA456XY' } }))
        .status,
    ).toBe(201);
  });

  it('rejects invalid plates', async () => {
    const w = world();
    const res = await w.call('POST', '/v1/me/vehicles', { as: w.user(), body: { plate: 'ABCDE' } });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('PLATE_INVALID');
  });

  it('allows at most 5 vehicles', async () => {
    const w = world();
    const id = w.user();
    for (let i = 1; i <= 5; i++) {
      expect(
        (await w.call('POST', '/v1/me/vehicles', { as: id, body: { plate: `LND${i}00AA` } }))
          .status,
      ).toBe(201);
    }
    const res = await w.call('POST', '/v1/me/vehicles', { as: id, body: { plate: 'LND600AA' } });
    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('VEHICLE_LIMIT_REACHED');
  });

  it('keeps exactly one default, and promotes another when the default is removed', async () => {
    const w = world();
    const id = w.user();
    const a = (await w.call('POST', '/v1/me/vehicles', { as: id, body: { plate: 'AAA111AA' } }))
      .body?.id as string;
    const b = (await w.call('POST', '/v1/me/vehicles', { as: id, body: { plate: 'BBB222BB' } }))
      .body?.id as string;

    await w.call('PATCH', `/v1/me/vehicles/${b}`, {
      as: id,
      body: { isDefault: true, colour: 'Silver' },
    });
    let list = (await w.call('GET', '/v1/me/vehicles', { as: id })).body?.items as {
      id: string;
      isDefault: boolean;
      colour: string | null;
    }[];
    expect(list.filter((v) => v.isDefault).map((v) => v.id)).toEqual([b]);
    expect(list.find((v) => v.id === b)?.colour).toBe('Silver');

    expect((await w.call('DELETE', `/v1/me/vehicles/${b}`, { as: id })).status).toBe(204);
    list = (await w.call('GET', '/v1/me/vehicles', { as: id })).body?.items as typeof list;
    expect(list).toEqual([expect.objectContaining({ id: a, isDefault: true })]);
  });

  it('returns 404 for another driver’s vehicle', async () => {
    const w = world();
    const owner = w.user();
    const vid = (
      await w.call('POST', '/v1/me/vehicles', { as: owner, body: { plate: 'AAA111AA' } })
    ).body?.id as string;
    const other = w.user();
    expect(
      (await w.call('PATCH', `/v1/me/vehicles/${vid}`, { as: other, body: { colour: 'Red' } }))
        .status,
    ).toBe(404);
    expect((await w.call('DELETE', `/v1/me/vehicles/${vid}`, { as: other })).status).toBe(404);
  });
});
