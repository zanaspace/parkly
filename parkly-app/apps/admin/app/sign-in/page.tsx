import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '../../components/auth-page';
import { SignInForm } from '../../components/auth-forms';
import { safeNext } from '../../lib/auth/guard';
import { loadSession } from '../../lib/auth/session';

export const metadata = { title: 'Sign in · Parkly Admin' };

/** Why an admin was signed out (set by proxy.ts), so it never looks like a fault. */
const SIGN_OUT_REASON: Record<string, string> = {
  idle: 'You were signed out after 15 minutes without activity. Sign in again to continue.',
  expired: 'Your 12-hour session ended. Sign in again to continue.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const notice = SIGN_OUT_REASON[params.reason ?? ''];
  if ((await loadSession()).signedIn) redirect(next);
  return (
    <AuthPage title="Sign in" intro="Use the email address your Parkly invitation was sent to.">
      {notice ? (
        <p className="pk-notice pk-notice--info" role="status">
          {notice}
        </p>
      ) : null}
      <SignInForm next={next} />
      <Link className="pk-link" href="/reset-password">
        Forgot your password?
      </Link>
    </AuthPage>
  );
}
