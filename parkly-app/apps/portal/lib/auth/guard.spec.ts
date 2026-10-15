import { describe, expect, it } from 'vitest';
import type { RoleGrant } from '@parkly/contracts';
import { decideAccess, safeNext, type AppKind } from './guard';

const OP = '6f9619ff-8b86-4011-b42d-00c04fc964ff';
const base = { signedIn: true, currentLevel: 'aal1', nextLevel: 'aal1' } as const;

describe('decideAccess', () => {
  it('sends signed-out users to sign-in', () => {
    expect(decideAccess({ ...base, app: 'portal', signedIn: false, roles: [] })).toEqual({
      kind: 'sign-in',
    });
  });

  it('portal: owners/managers only; attendants and drivers get no-access', () => {
    for (const role of ['OPERATOR_ATTENDANT', 'DRIVER', 'ADMIN_OPS'] as const) {
      expect(decideAccess({ ...base, app: 'portal', roles: [{ role, operatorId: OP }] }).kind).toBe(
        'no-access',
      );
    }
  });

  it('admin: any admin role; operators get no-access', () => {
    expect(
      decideAccess({ ...base, app: 'admin', roles: [{ role: 'OPERATOR_OWNER', operatorId: OP }] })
        .kind,
    ).toBe('no-access');
  });

  it.each([
    ['portal', 'OPERATOR_OWNER'],
    ['portal', 'OPERATOR_MANAGER'],
    ['admin', 'ADMIN_SUPPORT'],
    ['admin', 'SUPER_ADMIN'],
  ] as const)(
    '%s %s: enrol when no factor, verify when one exists, ok at aal2',
    (app: AppKind, role: RoleGrant['role']) => {
      const roles = [{ role, operatorId: role.startsWith('OPERATOR') ? OP : null }];
      expect(decideAccess({ ...base, app, roles }).kind).toBe('mfa-enroll');
      expect(decideAccess({ ...base, app, roles, nextLevel: 'aal2' }).kind).toBe('mfa-verify');
      expect(
        decideAccess({ ...base, app, roles, currentLevel: 'aal2', nextLevel: 'aal2' }).kind,
      ).toBe('ok');
    },
  );

  it('checks the role before asking for MFA', () => {
    expect(
      decideAccess({ ...base, app: 'admin', roles: [], currentLevel: null, nextLevel: null }).kind,
    ).toBe('no-access');
  });
});

describe('safeNext (open-redirect guard)', () => {
  it.each([
    ['/mfa/enroll?backup=1', '/mfa/enroll?backup=1'],
    ['/', '/'],
    [undefined, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%j → %j', (input: string | undefined, out: string) => {
    expect(safeNext(input)).toBe(out);
  });
});
