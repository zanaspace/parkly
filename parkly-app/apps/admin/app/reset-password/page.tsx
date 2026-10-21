import Link from 'next/link';
import { AuthPage } from '../../components/auth-page';
import { ResetRequestForm } from '../../components/auth-forms';

export const metadata = { title: 'Reset password · Parkly Admin' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const expired = (await searchParams).error === 'expired';
  return (
    <AuthPage
      title="Reset your password"
      intro={
        expired
          ? 'That link has expired or was already used. Request a new one below.'
          : 'We’ll email you a link to choose a new password.'
      }
    >
      <ResetRequestForm />
      <Link className="pk-link" href="/sign-in">
        Back to sign in
      </Link>
    </AuthPage>
  );
}
