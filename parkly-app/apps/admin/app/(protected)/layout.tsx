import { Text } from '@parkly/ui';
import type { ReactNode } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { LogoMarkIcon } from '../../components/icons';
import { SignOutButtons } from '../../components/sign-out';
import { requireAccess } from '../../lib/auth/session';

const AUDIT_READERS = new Set(['ADMIN_COMPLIANCE', 'SUPER_ADMIN']);

/** Everything in (protected) needs an admin role and a completed MFA check (FR-AUTH-004). */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { me } = await requireAccess();
  const canReadAudit = me.roles.some((r) => AUDIT_READERS.has(r.role));
  const primaryRole = me.roles[0]?.role ?? 'ADMIN';

  return (
    <>
      <header className="pk-topbar">
        <div className="pk-row" style={{ gap: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <LogoMarkIcon size={26} />
            <Text variant="label-lg" tone="brand" style={{ fontWeight: '700', letterSpacing: '-0.3px', fontSize: '1.05rem' }}>
              Parkly Admin
            </Text>
          </div>
          <AdminNav canReadAudit={canReadAudit} />
        </div>
        <div className="pk-row" style={{ gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <Text variant="body-sm" tone="primary" style={{ fontWeight: '600' }}>
              {me.firstName ?? 'Admin'}
            </Text>
            <Text variant="caption" tone="tertiary" style={{ display: 'block', fontSize: '0.75rem' }}>
              {primaryRole}
            </Text>
          </div>
          <SignOutButtons />
        </div>
      </header>
      {children}
    </>
  );
}
