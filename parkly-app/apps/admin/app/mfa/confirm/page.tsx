import { redirect } from 'next/navigation';
import { AuthPage } from '../../../components/auth-page';
import { MfaVerifyForm } from '../../../components/auth-forms';
import { safeNext } from '../../../lib/auth/guard';
import { requireSignedInMember } from '../../../lib/auth/session';

export const metadata = { title: 'Confirm it is you · Parkly Admin' };

/**
 * Step-up (doc 05 section 4.6): changing money or rules needs a fresh authenticator-app
 * code. Unlike the sign-in check this works while already signed in, and sends the admin
 * back to what they were doing.
 */
export default async function MfaConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await requireSignedInMember();
  const next = safeNext((await searchParams).next);
  if (session.nextLevel !== 'aal2') redirect('/mfa/enroll');

  return (
    <AuthPage
      title="Confirm it is you"
      intro="This change needs a fresh code from your authenticator app. Enter it, then repeat the change."
    >
      <MfaVerifyForm next={next} />
    </AuthPage>
  );
}
