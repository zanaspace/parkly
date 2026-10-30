import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '../../../components/auth-page';
import { CodeSignInForm } from '../../../components/code-sign-in';
import { safeNext } from '../../../lib/auth/guard';
import { loadSession } from '../../../lib/auth/session';

export const metadata = { title: 'Attendant sign-in · Parkly for Operators' };

/** A-01 first sign-in: a 6-digit code to the invited email or phone (doc 03 §3). */
export default async function CodeSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next, '/attend');
  if ((await loadSession()).signedIn) redirect(next);
  return (
    <AuthPage
      title="Sign in to the gate app"
      intro="Use the email address or phone number your manager invited. We’ll send you a 6-digit code."
    >
      <CodeSignInForm next={next} />
      <Link className="pk-link" href={`/sign-in?next=${encodeURIComponent(next)}`}>
        Owner or manager? Sign in with your password
      </Link>
    </AuthPage>
  );
}
