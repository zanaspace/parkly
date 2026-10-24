import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInForm } from '../../components/sign-in-form';
import { loadDriver, safeNext } from '../../lib/session';

export const metadata: Metadata = { title: 'Sign in · Parkly' };

/** Drivers sign in with their phone, the same account as the app. */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await loadDriver()) redirect(next);
  return (
    <main className="pk-page pk-stack" style={{ marginBlock: '2.5rem', maxWidth: '34rem' }}>
      <div className="pk-card pk-stack" style={{ padding: '2.5rem 2rem', borderRadius: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span className="pk-badge pk-badge--brand-subtle" style={{ alignSelf: 'flex-start' }}>
            Driver Portal
          </span>
          <Text variant="heading-xl" as="h1" style={{ margin: '0.25rem 0' }}>
            Sign in to book
          </Text>
          <Text tone="secondary">
            Use your email address. It’s the same account as the Parkly mobile app.
          </Text>
        </div>
        <SignInForm next={next} />
      </div>
    </main>
  );
}
