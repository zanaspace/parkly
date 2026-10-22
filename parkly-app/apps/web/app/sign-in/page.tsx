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
    <main className="pk-page pk-stack">
      <Text variant="heading-xl" as="h1">
        Sign in to book
      </Text>
      <Text tone="secondary">Use your email address. It’s the same account as the Parkly app.</Text>
      <SignInForm next={next} />
    </main>
  );
}
