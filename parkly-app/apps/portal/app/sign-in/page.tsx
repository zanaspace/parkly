import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '../../components/auth-page';
import { SignInForm } from '../../components/auth-forms';
import { safeNext } from '../../lib/auth/guard';
import { loadSession } from '../../lib/auth/session';

export const metadata = { title: 'Sign in · Parkly for Operators' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if ((await loadSession()).signedIn) redirect(next);
  return (
    <AuthPage title="Sign in" intro="Use the email address your Parkly invitation was sent to.">
      <SignInForm next={next} />
      <Link className="pk-link" href="/reset-password">
        Forgot your password?
      </Link>
    </AuthPage>
  );
}
