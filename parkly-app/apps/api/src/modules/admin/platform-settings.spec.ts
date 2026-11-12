import { describe, expect, it } from 'vitest';
import { TEST_NOW, world } from '../../test-helpers.js';

type Role = 'SUPER_ADMIN' | 'ADMIN_FINANCE' | 'ADMIN_OPS' | 'ADMIN_COMPLIANCE' | 'ADMIN_SUPPORT';

function setup() {
  const w = world();
  const staff = (role: Role) => ({
    as: w.user([{ role, operatorId: null }], role),
    aal: 'aal2' as const,
  });
  const sa = staff('SUPER_ADMIN');
  const put = (key: string, body: unknown, who = sa) =>
    w.call('PUT', `/v1/admin/settings/${key}`, { ...who, body });
  const putFlag = (key: string, body: unknown, who = sa) =>
    w.call('PUT', `/v1/admin/feature-flags/${key}`, { ...who, body });
  const item = async (key: string) => {
    const res = await w.call('GET', '/v1/admin/settings', sa);
    return (res.body?.items as { key: string; value: unknown; isDefault: boolean }[]).find(
      (i) => i.key === key,
    );
  };
  return { w, staff, sa, put, putFlag, item };
}

describe('platform settings (FR-ADM-005)', () => {
  it('lists each setting with its limits and default, and says which are still the default', async () => {
    const t = setup();
    const res = await t.w.call('GET', '/v1/admin/settings', t.sa);
    expect(res.status).toBe(200);
    const items = res.body?.items as Record<string, unknown>[];
    expect(items.find((i) => i.key === 'booking.hold_minutes')).toEqual({
      key: 'booking.hold_minutes',
      label: 'Unpaid booking hold',
      description: expect.any(String),
      kind: 'int',
      unit: 'minutes',
      min: 1,
      max: 60,
      default: 10,
      value: 10,
      isDefault: true,
      updatedAt: null,
    });
    // The commission default is saved in the test store, so it is not "default" any more.
    expect(await t.item('fees.commission_bps_default')).toMatchObject({
      value: 1200,
      isDefault: false,
    });
  });

  it('saves a value inside the limits, audits old and new with the reason, and the API then uses it', async () => {
    const t = setup();
    const res = await t.put('booking.hold_minutes', { value: 15, reason: 'Slow card checkouts' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: 'booking.hold_minutes',
      value: 15,
      isDefault: false,
      updatedAt: TEST_NOW.toISOString(),
    });
    expect(await t.w.store.settings.get<number>('booking.hold_minutes')).toBe(15);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'platform_setting.changed',
      entityType: 'platform_setting',
      entityId: 'booking.hold_minutes',
      before: { value: 10 },
      after: { value: 15, reason: 'Slow card checkouts' },
    });

    // The next change shows the value it replaced.
    await t.put('booking.hold_minutes', { value: 12, reason: 'Back down a little' });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      before: { value: 15 },
      after: { value: 12 },
    });
  });

  it('refuses a number outside the limits, a fraction, a word, an unknown setting and a thin reason', async () => {
    const t = setup();
    for (const value of [0, 61, 1.5, '15', null]) {
      const res = await t.put('booking.hold_minutes', { value, reason: 'Trying it out' });
      expect(res.status, String(value)).toBe(400);
    }
    const low = await t.put('fees.commission_bps_default', { value: 900, reason: 'Cheaper' });
    expect(low.status).toBe(400);
    expect(low.body?.errors).toEqual([{ path: 'value', message: 'Must be at least 1000' }]);
    expect((await t.put('booking.hold_minutes', { value: 15, reason: 'no' })).status).toBe(400);
    expect((await t.put('made.up.key', { value: 1, reason: 'Trying it out' })).status).toBe(404);
    expect(await t.w.store.settings.get<number>('booking.hold_minutes')).toBeUndefined();
    expect(t.w.store.auditRows.filter((a) => a.action === 'platform_setting.changed')).toEqual([]);
  });

  it('takes on or off for a yes/no setting', async () => {
    const t = setup();
    expect(
      (await t.put('fees.vat_enabled', { value: true, reason: 'VAT registered' })).status,
    ).toBe(200);
    expect(await t.item('fees.vat_enabled')).toMatchObject({ value: true, isDefault: false });
    expect((await t.put('fees.vat_enabled', { value: 1, reason: 'VAT registered' })).status).toBe(
      400,
    );
  });

  it('shows the default when a hand-edited saved value no longer fits', async () => {
    const t = setup();
    t.w.store.settingRows.set('booking.hold_minutes', 9999);
    expect(await t.item('booking.hold_minutes')).toMatchObject({ value: 10, isDefault: true });
  });

  it('is for super admins only', async () => {
    const t = setup();
    for (const role of [
      'ADMIN_FINANCE',
      'ADMIN_OPS',
      'ADMIN_COMPLIANCE',
      'ADMIN_SUPPORT',
    ] as const) {
      const who = t.staff(role);
      expect((await t.w.call('GET', '/v1/admin/settings', who)).status, role).toBe(403);
      expect(
        (await t.put('booking.hold_minutes', { value: 15, reason: 'Slow card checkouts' }, who))
          .status,
        role,
      ).toBe(403);
    }
    expect(await t.w.store.settings.get('booking.hold_minutes')).toBeUndefined();
  });
});

describe('feature flags (FR-ADM-005)', () => {
  it('lists the known flags, all off to begin with, including four_eyes_verification', async () => {
    const t = setup();
    const res = await t.w.call('GET', '/v1/admin/feature-flags', t.sa);
    expect(res.status).toBe(200);
    const items = res.body?.items as { key: string; enabled: boolean }[];
    expect(items.map((i) => i.key)).toEqual(
      expect.arrayContaining(['claims_enabled', 'four_eyes_verification', 'passes_enabled']),
    );
    expect(items.every((i) => i.enabled === false)).toBe(true);
  });

  it('turns a flag on and off, audits each change with the reason, and the platform reads it', async () => {
    const t = setup();
    const on = await t.putFlag('four_eyes_verification', {
      enabled: true,
      reason: 'Two ops staff now',
    });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ key: 'four_eyes_verification', enabled: true });
    expect(await t.w.store.flags.enabled('four_eyes_verification')).toBe(true);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'feature_flag.changed',
      entityType: 'feature_flag',
      entityId: 'four_eyes_verification',
      before: { enabled: false },
      after: { enabled: true, reason: 'Two ops staff now' },
    });

    const list = await t.w.call('GET', '/v1/admin/feature-flags', t.sa);
    expect(
      (list.body?.items as { key: string; enabled: boolean }[]).find(
        (i) => i.key === 'four_eyes_verification',
      ),
    ).toMatchObject({ enabled: true, updatedAt: TEST_NOW.toISOString() });

    await t.putFlag('four_eyes_verification', { enabled: false, reason: 'One ops person left' });
    expect(await t.w.store.flags.enabled('four_eyes_verification')).toBe(false);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({ before: { enabled: true } });
  });

  it('refuses an unknown flag, a thin reason and anyone but a super admin', async () => {
    const t = setup();
    expect(
      (await t.putFlag('made_up_flag', { enabled: true, reason: 'Trying it out' })).status,
    ).toBe(404);
    expect((await t.putFlag('claims_enabled', { enabled: true, reason: 'no' })).status).toBe(400);
    expect(
      (await t.putFlag('claims_enabled', { enabled: 'yes', reason: 'Trying it out' })).status,
    ).toBe(400);
    const ops = t.staff('ADMIN_OPS');
    expect((await t.w.call('GET', '/v1/admin/feature-flags', ops)).status).toBe(403);
    expect(
      (await t.putFlag('claims_enabled', { enabled: true, reason: 'Trying it out' }, ops)).status,
    ).toBe(403);
    expect(await t.w.store.flags.enabled('claims_enabled')).toBe(false);
  });
});
