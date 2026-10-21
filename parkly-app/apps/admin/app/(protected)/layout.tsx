import { Text } from '@parkly/ui';
import type { ReactNode } from 'react';
import { SignOutButtons } from '../../components/sign-out';
import { requireAccess } from '../../lib/auth/session';

/** Everything in (protected) needs an admin role and a completed MFA check (FR-AUTH-004). */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { me } = await requireAccess();
  return (
    <>
      <header className="pk-topbar">
        <Text variant="label-lg" tone="brand">
          Parkly Admin
        </Text>
        <div className="pk-row">
          <Text variant="body-sm" tone="secondary">
            {me.firstName ?? 'Signed in'}
          </Text>
          <SignOutButtons />
        </div>
      </header>
      {children}
    </>
  );
}
