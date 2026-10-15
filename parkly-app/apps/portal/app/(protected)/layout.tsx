import { Text } from '@parkly/ui';
import type { ReactNode } from 'react';
import { SignOutButtons } from '../../components/sign-out';
import { requireAccess } from '../../lib/auth/session';

/** Everything in (protected) needs an operator owner/manager role and a completed MFA check. */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { me } = await requireAccess();
  return (
    <>
      <header className="pk-topbar">
        <Text variant="label-lg" tone="brand">
          Parkly for Operators
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
