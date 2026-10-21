import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Role } from '@parkly/domain/authz';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
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
    expect: { anon: 401, ...EVERYONE_SIGNED_IN },
  },
  {
    method: 'GET',
    path: '/v1/me/vehicles',
    route: 'GET /v1/me/vehicles',
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
    path: `/v1/operators/${OP_B}/members`,
    route: 'GET /v1/operators/{operatorId}/members (other tenant)',
    expect: only([], 200, 404),
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
];

/** Endpoints covered by dedicated tests instead (public, write-only or per-user resources). */
const COVERED_ELSEWHERE = new Set([
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
]);

describe('RBAC matrix', () => {
  const w = world();
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
