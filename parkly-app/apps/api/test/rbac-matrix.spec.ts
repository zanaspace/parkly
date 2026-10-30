import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Role } from '@parkly/domain/authz';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
import { allowAllRateLimiter } from '../src/middleware/rate-limit.js';
import { testApp, world } from '../src/test-helpers.js';

/**
 * RBAC matrix (doc 05 §5.3): every role × every authenticated endpoint, with
 * own-tenant and other-tenant cases. Adding an endpoint without a row here
 * fails the "covers every route" test below.
 */

type Who = 'anon' | Role;
const WHO: Who[] = [
  'anon',
  'DRIVER',
  'OPERATOR_OWNER',
  'OPERATOR_MANAGER',
  'OPERATOR_ATTENDANT',
  'ADMIN_SUPPORT',
  'ADMIN_OPS',
  'ADMIN_FINANCE',
  'ADMIN_COMPLIANCE',
  'SUPER_ADMIN',
];

const OP_A = randomUUID();
const OP_B = randomUUID();
const TARGET_USER = randomUUID();
const LOT_A = randomUUID();
const EVERYONE_SIGNED_IN = Object.fromEntries(
  WHO.filter((w) => w !== 'anon').map((w) => [w, 200]),
) as Record<Who, number>;
const only = (allowed: Who[], ok: number, denied: number) =>
  Object.fromEntries(
    WHO.map((w) => [w, w === 'anon' ? 401 : allowed.includes(w) ? ok : denied]),
  ) as Record<Who, number>;

type Row = { method: string; path: string; route: string; expect: Record<Who, number> };

const MATRIX: Row[] = [
  {
    method: 'GET',
    path: '/v1/me',
    route: 'GET /v1/me',
    expect: { ...EVERYONE_SIGNED_IN, anon: 401 },
  },
  {
    method: 'GET',
    path: '/v1/me/vehicles',
    route: 'GET /v1/me/vehicles',
    expect: only(['DRIVER'], 200, 403),
  },
  {
    method: 'GET',
    path: '/v1/bookings',
    route: 'GET /v1/bookings',
    expect: only(['DRIVER'], 200, 403),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}/members`,
    route: 'GET /v1/operators/{operatorId}/members',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}/occupancy`,
    route: 'GET /v1/operators/{operatorId}/occupancy',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}/devices`,
    route: 'GET /v1/operators/{operatorId}/devices',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_B}/members`,
    route: 'GET /v1/operators/{operatorId}/members (other tenant)',
    expect: only([], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}`,
    route: 'GET /v1/operators/{operatorId}',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_B}`,
    route: 'GET /v1/operators/{operatorId} (other tenant)',
    expect: only([], 200, 404),
  },
  {
    method: 'GET',
    path: '/v1/banks',
    route: 'GET /v1/banks',
    expect: only(
      ['OPERATOR_OWNER', 'OPERATOR_MANAGER', 'ADMIN_OPS', 'ADMIN_FINANCE', 'SUPER_ADMIN'],
      200,
      403,
    ),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}/kyb-documents`,
    route: 'GET /v1/operators/{operatorId}/kyb-documents',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_B}/kyb-documents`,
    route: 'GET /v1/operators/{operatorId}/kyb-documents (other tenant)',
    expect: only([], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}/payout-account`,
    route: 'GET /v1/operators/{operatorId}/payout-account',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'POST',
    path: `/v1/operators/${OP_A}/kyb/submit`,
    route: 'POST /v1/operators/{operatorId}/kyb/submit',
    // Owner reaches the completeness check; managers may look but not submit.
    expect: { ...only([], 200, 404), OPERATOR_OWNER: 422, OPERATOR_MANAGER: 403 },
  },
  {
    method: 'POST',
    path: `/v1/operators/${OP_B}/kyb/submit`,
    route: 'POST /v1/operators/{operatorId}/kyb/submit (other tenant)',
    expect: only([], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}/lots`,
    route: 'GET /v1/operators/{operatorId}/lots',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_B}/lots`,
    route: 'GET /v1/operators/{operatorId}/lots (other tenant)',
    expect: only([], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_A}/lots/${LOT_A}`,
    route: 'GET /v1/operators/{operatorId}/lots/{lotId}',
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 200, 404),
  },
  {
    method: 'GET',
    path: `/v1/operators/${OP_B}/lots/${LOT_A}`,
    route: 'GET /v1/operators/{operatorId}/lots/{lotId} (other tenant)',
    expect: only([], 200, 404),
  },
  {
    method: 'POST',
    path: `/v1/operators/${OP_A}/lots/${LOT_A}/submit`,
    route: 'POST /v1/operators/{operatorId}/lots/{lotId}/submit',
    // The seeded draft has no photos, hours, prices or permit: the guard answers.
    expect: only(['OPERATOR_OWNER', 'OPERATOR_MANAGER'], 422, 404),
  },
  {
    method: 'POST',
    path: `/v1/operators/${OP_B}/lots/${LOT_A}/submit`,
    route: 'POST /v1/operators/{operatorId}/lots/{lotId}/submit (other tenant)',
    expect: only([], 200, 404),
  },
  {
    method: 'GET',
    path: '/v1/admin/operators',
    route: 'GET /v1/admin/operators',
    expect: only(['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'], 200, 403),
  },
  {
    method: 'GET',
    path: `/v1/admin/operators/${OP_A}`,
    route: 'GET /v1/admin/operators/{operatorId}',
    expect: only(['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'], 200, 403),
  },
  {
    method: 'GET',
    path: '/v1/admin/lots',
    route: 'GET /v1/admin/lots',
    expect: only(['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'], 200, 403),
  },
  {
    method: 'GET',
    path: `/v1/admin/lots/${LOT_A}`,
    route: 'GET /v1/admin/lots/{lotId}',
    expect: only(['ADMIN_OPS', 'ADMIN_COMPLIANCE', 'SUPER_ADMIN'], 200, 403),
  },
  {
    method: 'GET',
    path: '/v1/admin/audit-logs',
    route: 'GET /v1/admin/audit-logs',
    expect: only(['ADMIN_COMPLIANCE', 'SUPER_ADMIN'], 200, 403),
  },
  {
    method: 'POST',
    path: `/v1/admin/users/${TARGET_USER}/sessions/revoke`,
    route: 'POST /v1/admin/users/{userId}/sessions/revoke',
    expect: only(['SUPER_ADMIN'], 204, 403),
  },
  {
    method: 'GET',
    path: '/v1/me/unpaid-overstay',
    route: 'GET /v1/me/unpaid-overstay',
    expect: only(['DRIVER'], 200, 403),
  },
  {
    // No such booking: allowed roles get past the permission check to a 404.
    method: 'GET',
    path: '/v1/admin/bookings/by-code/PK-AAAAAA',
    route: 'GET /v1/admin/bookings/by-code/{code}',
    expect: only(['ADMIN_SUPPORT', 'ADMIN_OPS', 'ADMIN_FINANCE', 'SUPER_ADMIN'], 404, 403),
  },
];

/** Endpoints covered by dedicated tests instead (public, write-only or per-user resources). */
const COVERED_ELSEWHERE = new Set([
  // overstay:waive needs a reason body; ops allowed, support 403: attend.spec; roles: authz.spec
  'POST /v1/admin/bookings/{id}/overstay/waive',
  'POST /v1/auth/otp/precheck', // public; auth.spec
  'POST /v1/auth/bootstrap', // any valid token; auth.spec
  'POST /v1/auth/sessions/revoke', // own sessions only; auth.spec
  'PATCH /v1/me',
  'POST /v1/me/consents',
  'POST /v1/me/devices',
  'DELETE /v1/me',
  'POST /v1/me/vehicles',
  'PATCH /v1/me/vehicles/{id}',
  'DELETE /v1/me/vehicles/{id}', // me.spec: own vehicles, other driver → 404
  // Drivers only (owner 403), other driver's booking or payment → 404, idempotency: bookings.spec
  // Lot-scoped attendant routes, device approval and the device checks: attend.spec
  'GET /v1/attend/lots',
  'POST /v1/attend/devices',
  'GET /v1/attend/lots/{lotId}/manifest',
  'POST /v1/attend/sync',
  // Self check-in: owner switch (attendant 404), driver's own booking only (others 404): attend.spec
  'GET /v1/operators/{operatorId}/lots/{lotId}/self-check-in',
  'POST /v1/operators/{operatorId}/lots/{lotId}/self-check-in',
  'POST /v1/bookings/{id}/self-check-in',
  'POST /v1/bookings/{id}/self-check-out',
  'POST /v1/operators/{operatorId}/devices/{deviceId}',
  'POST /v1/bookings',
  'GET /v1/bookings/{id}',
  'GET /v1/bookings/{id}/receipt',
  // Signed receipt link: other drivers 404 (receipt.spec)
  'POST /v1/bookings/{id}/receipt-link',
  // Public, but only with a valid 5-minute signature for that booking (receipt.spec)
  'GET /v1/receipts/{id}',
  'GET /v1/bookings/{id}/extensions/options',
  'POST /v1/bookings/{id}/extensions',
  'POST /v1/bookings/{id}/cancel',
  'POST /v1/bookings/{id}/overstay/pay',
  'POST /v1/payments/{reference}/verify',
  'POST /v1/operators', // any signed-in user, incl. no role yet; operators.spec
  'PATCH /v1/operators/{operatorId}', // owner only, manager 403, other tenant 404; operators.spec
  // Owner only, manager 403, other tenant 404, cross-operator file → 404: kyb.spec
  'POST /v1/operators/{operatorId}/kyb-documents',
  'POST /v1/operators/{operatorId}/kyb-documents/{fileId}/complete',
  'DELETE /v1/operators/{operatorId}/kyb-documents/{documentId}',
  'PUT /v1/operators/{operatorId}/payout-account',
  // Owner + manager, attendant 404, other operator 404, stale version 409: lots.spec
  'POST /v1/operators/{operatorId}/lots',
  'PATCH /v1/operators/{operatorId}/lots/{lotId}',
  'PUT /v1/operators/{operatorId}/lots/{lotId}/opening-hours',
  'POST /v1/operators/{operatorId}/lots/{lotId}/photos',
  'POST /v1/operators/{operatorId}/lots/{lotId}/photos/{fileId}/complete',
  'DELETE /v1/operators/{operatorId}/lots/{lotId}/photos/{photoId}',
  // Same lot lookup as the edits above (other operator 404); behaviour in submit.spec
  'POST /v1/operators/{operatorId}/lots/{lotId}/permits/document',
  'POST /v1/operators/{operatorId}/lots/{lotId}/permits',
  'PUT /v1/operators/{operatorId}/lots/{lotId}/rate-plans',
  'POST /v1/operators/{operatorId}/lots/{lotId}/visibility',
  // Same kyb:review rule as the rows above; behaviour in admin/kyb.spec
  'GET /v1/admin/operators/{operatorId}/kyb-documents/{documentId}/url',
  'POST /v1/admin/operators/{operatorId}/kyb/review',
  // lot:review / permit:review / rate-plan:review / lot:verify (authz.spec); allowed and
  // denied roles per decision in admin/lots.spec
  'GET /v1/admin/permits/{permitId}/document-url',
  'POST /v1/admin/permits/{permitId}/review',
  'POST /v1/admin/rate-plans/{ratePlanId}/review',
  'POST /v1/admin/lot-photos/{photoId}/review',
  'POST /v1/admin/lots/{lotId}/verifications',
  'POST /v1/admin/verifications/{verificationId}/review',
  'POST /v1/admin/lots/{lotId}/status',
  // Owner/manager per role, other operator 404, invitee identity match: team/team.spec
  'POST /v1/operators/{operatorId}/members',
  'DELETE /v1/operators/{operatorId}/members/{memberId}',
  'POST /v1/auth/invites/accept',
  'POST /v1/invites/preview', // public, token-gated and rate limited; team.spec
  // Public driver discovery: no sign-in, only listable lots (discovery.spec)
  'GET /v1/lots/search',
  'GET /v1/lots/{idOrSlug}',
  'GET /v1/lots/{lotId}/availability',
  'POST /v1/lots/{lotId}/quote',
  'GET /v1/places/autocomplete', // public, rate limited; places.spec
]);

describe('RBAC matrix', () => {
  // One client makes every request here; rate limits are tested on their own (auth.spec).
  const w = world({ rateLimiter: allowAllRateLimiter });
  const ids = Object.fromEntries(
    WHO.filter((who) => who !== 'anon').map((role) => [
      role,
      w.user(
        [{ role: role as Role, operatorId: role.startsWith('OPERATOR') ? OP_A : null }],
        'Test',
      ),
    ]),
  ) as Record<Role, string>;
  w.store.seedUser(TARGET_USER, { roles: [{ role: 'DRIVER', operatorId: null }] });
  w.store.operatorRows.set(OP_A, {
    id: OP_A,
    legalName: 'Operator A Ltd',
    tradingName: 'Operator A',
    type: 'HOTEL',
    cacNumberEnc: null,
    tinEnc: null,
    addressLine: null,
    contactEmail: null,
    contactPhoneEnc: null,
    status: 'ONBOARDING',
    kybStatus: 'NOT_STARTED',
    kybSubmittedAt: null,
    kybRejectionReason: null,
    commissionBps: 1200,
    createdAt: new Date('2026-10-21T00:00:00Z'),
  });
  w.store.lotRows.set(LOT_A, {
    id: LOT_A,
    operatorId: OP_A,
    slug: 'operator-a-lot-0000',
    type: 'HOTEL',
    name: 'Operator A Lot',
    description: null,
    addressLine: 'Victoria Island',
    area: null,
    lga: null,
    location: { lat: 6.4281, lng: 3.4219 },
    entranceNotes: null,
    capacityTotal: 10,
    capacityBookable: 5,
    amenities: [],
    vehicleTypes: ['CAR'],
    status: 'DRAFT',
    statusReason: null,
    selfCheckinEnabled: false,
    version: 1,
    createdAt: new Date('2026-10-21T00:00:00Z'),
  });

  for (const row of MATRIX) {
    for (const who of WHO) {
      it(`${row.route} as ${who} → ${row.expect[who]}`, async () => {
        const res = await w.call(
          row.method,
          row.path,
          who === 'anon' ? {} : { as: ids[who], aal: 'aal2' },
        );
        expect(res.status).toBe(row.expect[who]);
      });
    }
  }

  it('covers every authenticated route in the OpenAPI document', () => {
    const doc = testApp().getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 't', version: '0' },
    });
    const routes = Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
      Object.keys(item ?? {}).map((method) => `${method.toUpperCase()} ${path}`),
    );
    const inMatrix = new Set(MATRIX.map((r) => r.route));
    const missing = routes
      .filter((r) => r.startsWith('GET /v1') || r.includes(' /v1/'))
      .filter((r) => !inMatrix.has(r) && !COVERED_ELSEWHERE.has(r));
    expect(missing).toEqual([]);
  });
});

describe('MFA enforcement (FR-AUTH-004)', () => {
  it('rejects admin and operator-owner requests below aal2 with AUTH_MFA_REQUIRED', async () => {
    const w = world();
    const admin = w.user([{ role: 'ADMIN_COMPLIANCE', operatorId: null }], 'A');
    const owner = w.user([{ role: 'OPERATOR_OWNER', operatorId: OP_A }], 'O');
    const a = await w.call('GET', '/v1/admin/audit-logs', { as: admin, aal: 'aal1' });
    expect([a.status, a.body?.code]).toEqual([403, 'AUTH_MFA_REQUIRED']);
    const o = await w.call('GET', `/v1/operators/${OP_A}/members`, { as: owner, aal: 'aal1' });
    expect([o.status, o.body?.code]).toEqual([403, 'AUTH_MFA_REQUIRED']);
  });

  it('does not reveal another operator exists to an aal1 session either', async () => {
    const w = world();
    const owner = w.user([{ role: 'OPERATOR_OWNER', operatorId: OP_A }], 'O');
    expect(
      (await w.call('GET', `/v1/operators/${OP_B}/members`, { as: owner, aal: 'aal1' })).status,
    ).toBe(404);
  });
});

describe('Scenario: cross-operator access is denied (FR-AUTH-005)', () => {
  it('returns 404 and logs an authz.denied event', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      stream: new Writable({ write: (chunk, _e, cb) => (lines.push(String(chunk)), cb()) }),
    });
    const w = world({ logger });
    const managerA = w.user([{ role: 'OPERATOR_MANAGER', operatorId: OP_A }], 'M');
    const res = await w.call('GET', `/v1/operators/${OP_B}/members`, { as: managerA, aal: 'aal2' });
    expect(res.status).toBe(404);
    const denied = lines
      .map((l) => JSON.parse(l) as { event?: string; action?: string })
      .find((l) => l.event === 'authz.denied');
    expect(denied).toMatchObject({ action: 'operator:members:read' });
  });

  it('re-reads roles from the database: a removed role stops working immediately', async () => {
    const w = world();
    const manager = w.user([{ role: 'OPERATOR_MANAGER', operatorId: OP_A }], 'M');
    expect(
      (await w.call('GET', `/v1/operators/${OP_A}/members`, { as: manager, aal: 'aal2' })).status,
    ).toBe(200);
    w.store.roleRows.splice(
      w.store.roleRows.findIndex((r) => r.userId === manager),
      1,
    );
    expect(
      (await w.call('GET', `/v1/operators/${OP_A}/members`, { as: manager, aal: 'aal2' })).status,
    ).toBe(404);
  });
});

describe('admin audit log', () => {
  it('pages newest first with a cursor', async () => {
    const w = world();
    const sa = w.user([{ role: 'SUPER_ADMIN', operatorId: null }], 'S');
    for (let i = 0; i < 3; i++) {
      await w.store.audit.write({
        actorUserId: sa,
        actorRole: 'SUPER_ADMIN',
        action: `test.${i}`,
        entityType: 'test',
        entityId: String(i),
        ipHash: null,
        userAgent: null,
        requestId: null,
      });
    }
    const p1 = await w.call('GET', '/v1/admin/audit-logs?limit=2', { as: sa, aal: 'aal2' });
    expect((p1.body?.items as { action: string }[]).map((i) => i.action)).toEqual([
      'test.2',
      'test.1',
    ]);
    const p2 = await w.call(
      'GET',
      `/v1/admin/audit-logs?limit=2&cursor=${p1.body?.nextCursor as string}`,
      { as: sa, aal: 'aal2' },
    );
    expect((p2.body?.items as { action: string }[]).map((i) => i.action)).toEqual(['test.0']);
    expect(p2.body?.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor', async () => {
    const w = world();
    const sa = w.user([{ role: 'SUPER_ADMIN', operatorId: null }], 'S');
    expect(
      (await w.call('GET', '/v1/admin/audit-logs?cursor=garbage', { as: sa, aal: 'aal2' })).status,
    ).toBe(400);
  });
});

describe('admin revokes a user’s sessions (FR-AUTH-006)', () => {
  it('ends their Supabase sessions, revokes their devices and writes an audit row', async () => {
    const w = world();
    const sa = w.user([{ role: 'SUPER_ADMIN', operatorId: null }], 'S');
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'D');
    await w.store.devices.upsert({
      userId: driver,
      clientDeviceId: 'phone-1',
      platform: 'ANDROID',
      appVersion: null,
      authSessionId: randomUUID(),
    });
    const res = await w.call('POST', `/v1/admin/users/${driver}/sessions/revoke`, {
      as: sa,
      aal: 'aal2',
    });
    expect(res.status).toBe(204);
    expect(w.store.revokedSessionUsers).toEqual([driver]);
    expect(w.store.deviceRows.every((d) => d.revokedAt !== null)).toBe(true);
    expect(w.store.auditRows).toMatchObject([
      { actorUserId: sa, action: 'user.sessions_revoked', entityType: 'user', entityId: driver },
    ]);
  });

  it('returns 404 for an unknown user and revokes nothing', async () => {
    const w = world();
    const sa = w.user([{ role: 'SUPER_ADMIN', operatorId: null }], 'S');
    const res = await w.call('POST', `/v1/admin/users/${randomUUID()}/sessions/revoke`, {
      as: sa,
      aal: 'aal2',
    });
    expect(res.status).toBe(404);
    expect(w.store.revokedSessionUsers).toEqual([]);
  });
});
