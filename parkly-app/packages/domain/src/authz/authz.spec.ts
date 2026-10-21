import { describe, expect, it } from 'vitest';
import { can, isAdmin, needsAal2, type Actor } from './authz.js';

const OP_A = 'op-a';
const OP_B = 'op-b';

const actor = (roles: Actor['roles'], extra: Partial<Actor> = {}): Actor => ({
  userId: 'u1',
  roles,
  aal: 'aal1',
  ...extra,
});

const driver = actor([{ role: 'DRIVER', operatorId: null }]);
const ownerA = actor([{ role: 'OPERATOR_OWNER', operatorId: OP_A }], { aal: 'aal2' });
const managerA = actor([{ role: 'OPERATOR_MANAGER', operatorId: OP_A }], { aal: 'aal2' });
const attendantA = actor([{ role: 'OPERATOR_ATTENDANT', operatorId: OP_A }], { lotIds: ['lot-1'] });
const compliance = actor([{ role: 'ADMIN_COMPLIANCE', operatorId: null }], { aal: 'aal2' });
const support = actor([{ role: 'ADMIN_SUPPORT', operatorId: null }], { aal: 'aal2' });

describe('deny by default (doc 05 §5.2)', () => {
  const newcomer = actor([]);

  it('lets a signed-in user with no roles only read their profile, sign out and create an operator', () => {
    // An operator who just signed up by email has no role until their operator exists (S2).
    expect(can(newcomer, 'profile:read:own', { ownerUserId: 'u1' })).toBe(true);
    expect(can(newcomer, 'session:revoke:own', { ownerUserId: 'u1' })).toBe(true);
    expect(can(newcomer, 'operator:create', { ownerUserId: 'u1' })).toBe(true);
  });

  it('denies a user with no roles everything else', () => {
    for (const action of [
      'profile:update:own',
      'consent:write:own',
      'device:register:own',
      'vehicle:manage:own',
      'account:delete:own',
    ] as const) {
      expect(can(newcomer, action, { ownerUserId: 'u1' }), action).toBe(false);
    }
    expect(can(newcomer, 'operator:read', { operatorId: OP_A })).toBe(false);
    expect(can(newcomer, 'audit:read', {})).toBe(false);
  });

  it('never lets anyone create an operator on someone else’s behalf', () => {
    expect(can(newcomer, 'operator:create', { ownerUserId: 'u2' })).toBe(false);
    expect(can(compliance, 'operator:create', { ownerUserId: 'u2' })).toBe(false);
  });
});

describe('lots (FR-LOT-002)', () => {
  it('lets owner and manager create, edit and read their operator’s lots', () => {
    for (const who of [ownerA, managerA]) {
      expect(can(who, 'lot:manage', { operatorId: OP_A })).toBe(true);
      expect(can(who, 'lot:read', { operatorId: OP_A })).toBe(true);
    }
  });
  it('denies other operators, attendants and drivers', () => {
    expect(can(ownerA, 'lot:manage', { operatorId: OP_B })).toBe(false);
    expect(can(attendantA, 'lot:manage', { operatorId: OP_A })).toBe(false);
    expect(can(driver, 'lot:read', { operatorId: OP_A })).toBe(false);
  });
});

describe('KYB and payout account (FR-LOT-001)', () => {
  it('lets only the owner upload documents, set the bank account and submit KYB', () => {
    expect(can(ownerA, 'operator:kyb:manage', { operatorId: OP_A })).toBe(true);
    expect(can(managerA, 'operator:kyb:manage', { operatorId: OP_A })).toBe(false);
    expect(can(ownerA, 'operator:kyb:manage', { operatorId: OP_B })).toBe(false);
  });

  it('lets owner and manager see KYB progress, not attendants', () => {
    expect(can(ownerA, 'operator:kyb:read', { operatorId: OP_A })).toBe(true);
    expect(can(managerA, 'operator:kyb:read', { operatorId: OP_A })).toBe(true);
    expect(can(attendantA, 'operator:kyb:read', { operatorId: OP_A })).toBe(false);
  });

  it('shows the bank list to operator owners/managers and finance staff, not drivers', () => {
    expect(can(ownerA, 'bank:list', {})).toBe(true);
    expect(can(managerA, 'bank:list', {})).toBe(true);
    expect(
      can(actor([{ role: 'ADMIN_FINANCE', operatorId: null }], { aal: 'aal2' }), 'bank:list', {}),
    ).toBe(true);
    expect(can(driver, 'bank:list', {})).toBe(false);
    expect(can(attendantA, 'bank:list', {})).toBe(false);
  });
});

describe('operator business details (FR-LOT-001)', () => {
  it('lets owner and manager read their operator; only the owner edits it', () => {
    expect(can(ownerA, 'operator:read', { operatorId: OP_A })).toBe(true);
    expect(can(managerA, 'operator:read', { operatorId: OP_A })).toBe(true);
    expect(can(ownerA, 'operator:update', { operatorId: OP_A })).toBe(true);
    expect(can(managerA, 'operator:update', { operatorId: OP_A })).toBe(false);
  });

  it('denies other operators, attendants and drivers', () => {
    expect(can(ownerA, 'operator:read', { operatorId: OP_B })).toBe(false);
    expect(can(attendantA, 'operator:read', { operatorId: OP_A })).toBe(false);
    expect(can(driver, 'operator:read', { operatorId: OP_A })).toBe(false);
  });

  it('requires a completed MFA check (aal2) for the owner', () => {
    expect(can({ ...ownerA, aal: 'aal1' }, 'operator:update', { operatorId: OP_A })).toBe(false);
  });
});

describe('own-resource permissions', () => {
  it('lets a user manage their own profile, vehicles and consents', () => {
    for (const action of [
      'profile:read:own',
      'profile:update:own',
      'consent:write:own',
      'device:register:own',
      'session:revoke:own',
    ] as const) {
      expect(can(driver, action, { ownerUserId: 'u1' })).toBe(true);
    }
    expect(can(driver, 'vehicle:manage:own', { ownerUserId: 'u1' })).toBe(true);
    expect(can(driver, 'account:delete:own', { ownerUserId: 'u1' })).toBe(true);
  });

  it('never lets a user act on someone else’s resource', () => {
    expect(can(driver, 'profile:read:own', { ownerUserId: 'u2' })).toBe(false);
    expect(can(driver, 'vehicle:manage:own', { ownerUserId: 'u2' })).toBe(false);
  });

  it('limits vehicles and account deletion to drivers', () => {
    expect(can(ownerA, 'vehicle:manage:own', { ownerUserId: 'u1' })).toBe(false);
    expect(can(ownerA, 'account:delete:own', { ownerUserId: 'u1' })).toBe(false);
  });

  it('lets staff use profile and session actions on themselves', () => {
    expect(can(ownerA, 'profile:read:own', { ownerUserId: 'u1' })).toBe(true);
    expect(can(compliance, 'session:revoke:own', { ownerUserId: 'u1' })).toBe(true);
  });
});

describe('operator scoping (FR-AUTH-005)', () => {
  it('lets owner and manager read their own operator’s members', () => {
    expect(can(ownerA, 'operator:members:read', { operatorId: OP_A })).toBe(true);
    expect(can(managerA, 'operator:members:read', { operatorId: OP_A })).toBe(true);
  });

  it('denies a manager of operator A anything at operator B', () => {
    expect(can(managerA, 'operator:members:read', { operatorId: OP_B })).toBe(false);
  });

  it('denies attendants and drivers operator member lists', () => {
    expect(can(attendantA, 'operator:members:read', { operatorId: OP_A })).toBe(false);
    expect(can(driver, 'operator:members:read', { operatorId: OP_A })).toBe(false);
  });

  it('requires an operator id on operator-scoped resources', () => {
    expect(can(ownerA, 'operator:members:read', {})).toBe(false);
  });

  it('scopes attendants to their assigned lots', () => {
    expect(can(attendantA, 'lot:checkin', { operatorId: OP_A, lotId: 'lot-1' })).toBe(true);
    expect(can(attendantA, 'lot:checkin', { operatorId: OP_A, lotId: 'lot-2' })).toBe(false);
    expect(can(attendantA, 'lot:checkin', { operatorId: OP_B, lotId: 'lot-1' })).toBe(false);
  });
});

describe('platform roles', () => {
  it('lets compliance read the audit log, but not support or operators', () => {
    expect(can(compliance, 'audit:read', {})).toBe(true);
    expect(can(support, 'audit:read', {})).toBe(false);
    expect(can(ownerA, 'audit:read', {})).toBe(false);
  });

  it('lets super admin read the audit log and revoke any user’s sessions', () => {
    const sa = actor([{ role: 'SUPER_ADMIN', operatorId: null }], { aal: 'aal2' });
    expect(can(sa, 'audit:read', {})).toBe(true);
    expect(can(sa, 'user:sessions:revoke', {})).toBe(true);
    expect(can(compliance, 'user:sessions:revoke', {})).toBe(false);
  });

  it('denies admin permissions below aal2 even with the role', () => {
    expect(can({ ...compliance, aal: 'aal1' }, 'audit:read', {})).toBe(false);
  });
});

describe('MFA requirement (FR-AUTH-004)', () => {
  it.each([
    ['DRIVER', false],
    ['OPERATOR_ATTENDANT', false],
    ['OPERATOR_MANAGER', true],
    ['OPERATOR_OWNER', true],
    ['ADMIN_SUPPORT', true],
    ['SUPER_ADMIN', true],
  ] as const)('%s needs aal2: %s', (role, expected) => {
    expect(
      needsAal2(actor([{ role, operatorId: role.startsWith('OPERATOR') ? OP_A : null }])),
    ).toBe(expected);
  });

  it('denies operator-scoped actions to an owner below aal2', () => {
    expect(can({ ...ownerA, aal: 'aal1' }, 'operator:members:read', { operatorId: OP_A })).toBe(
      false,
    );
  });

  it('identifies admins', () => {
    expect(isAdmin(compliance)).toBe(true);
    expect(isAdmin(ownerA)).toBe(false);
  });
});
