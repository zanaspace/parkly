import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '../../components/auth-page';
import { SignUpForm } from '../../components/operator-forms';
import { safeNext } from '../../lib/auth/guard';
import { loadSession } from '../../lib/auth/session';

export const metadata = { title: 'Create an operator account · Parkly for Operators' };

/** O-01: lot owners sign up with email + password, then confirm the address. */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const asked = (await searchParams).next;
  // An invited manager arrives with next=/invite/…; they return there after confirming.
  const next = asked ? safeNext(asked) : undefined;
  if ((await loadSession()).signedIn) redirect(next ?? '/');
  return (
    <AuthPage
      title="Create an operator account"
      intro="For businesses that run car parks in Lagos: hotels, offices, commercial lots and event centres."
    >
      <SignUpForm {...(next ? { next } : {})} />
      <Link
        className="pk-link"
        href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}
      >
        Already have an account? Sign in
      </Link>
    </AuthPage>
  );
}
