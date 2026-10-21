import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '../../components/auth-page';
import { SignUpForm } from '../../components/operator-forms';
import { loadSession } from '../../lib/auth/session';

export const metadata = { title: 'Create an operator account · Parkly for Operators' };

/** O-01: lot owners sign up with email + password, then confirm the address. */
export default async function SignUpPage() {
  if ((await loadSession()).signedIn) redirect('/');
  return (
    <AuthPage
      title="Create an operator account"
      intro="For businesses that run car parks in Lagos: hotels, offices, commercial lots and event centres."
    >
      <SignUpForm />
      <Link className="pk-link" href="/sign-in">
        Already have an account? Sign in
      </Link>
    </AuthPage>
  );
}
