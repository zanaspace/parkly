import { redirect } from 'next/navigation';
import { AuthPage } from '../../../components/auth-page';
import { MfaVerifyForm } from '../../../components/auth-forms';
import { SignOutButtons } from '../../../components/sign-out';
import { safeNext } from '../../../lib/auth/guard';
import { requireSignedInMember } from '../../../lib/auth/session';

export const metadata = { title: 'Two-step sign-in · Parkly for Operators' };

export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await requireSignedInMember();
  const next = safeNext((await searchParams).next);
  if (session.nextLevel !== 'aal2') redirect('/mfa/enroll');
  if (session.currentLevel === 'aal2') redirect(next);

  return (
    <AuthPage
      title="Two-step sign-in"
      intro="Enter the code from your authenticator app to continue."
    >
      <MfaVerifyForm next={next} />
      <SignOutButtons />
    </AuthPage>
  );
}
