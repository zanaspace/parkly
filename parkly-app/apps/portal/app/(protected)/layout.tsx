import { Text } from '@parkly/ui';
import type { ReactNode } from 'react';
import { LogoMarkIcon } from '../../components/icons';
import { PortalNav } from '../../components/portal-nav';
import { UserAccountMenu } from '../../components/user-menu';
import { requireAccess } from '../../lib/auth/session';

/** Everything in (protected) needs an operator owner/manager role and a completed MFA check. */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { me, email } = await requireAccess();
  const isOwner = me.roles.some((r) => r.role === 'OPERATOR_OWNER');
  const primaryRole = me.roles.find((r) => r.role === 'OPERATOR_OWNER')?.role
    ?? me.roles.find((r) => r.role === 'OPERATOR_MANAGER')?.role
    ?? me.roles[0]?.role
    ?? 'OPERATOR';

  const roleLabel = primaryRole === 'OPERATOR_OWNER'
    ? 'Owner'
    : primaryRole === 'OPERATOR_MANAGER'
    ? 'Manager'
    : 'Operator';

  const userInfo = {
    name: [me.firstName, me.lastName].filter(Boolean).join(' ') || 'Operator',
    role: roleLabel,
    email: email ?? undefined,
  };

  return (
    <>
      <header className="pk-topbar">
        <div className="pk-topbar-main">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <LogoMarkIcon size={26} />
            <Text variant="label-lg" tone="brand" style={{ fontWeight: '700', letterSpacing: '-0.3px', fontSize: '1.05rem', whiteSpace: 'nowrap' }}>
              Parkly Ops
            </Text>
          </div>
          <span className="pk-topbar-divider" aria-hidden="true" />
          <PortalNav isOwner={isOwner} user={userInfo} />
        </div>
        <div className="pk-topbar-user">
          <UserAccountMenu user={userInfo} />
        </div>
      </header>
      <div className="pk-app-body">
        {children}
      </div>
    </>
  );
}
