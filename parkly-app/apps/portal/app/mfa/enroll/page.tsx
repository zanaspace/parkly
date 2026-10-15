import { redirect } from 'next/navigation';
import { AuthPage } from '../../../components/auth-page';
import { MfaEnrollFlow } from '../../../components/auth-forms';
import { requireSignedInMember } from '../../../lib/auth/session';
import { createClient } from '../../../lib/supabase/server';

export const metadata = { title: 'Set up two-step sign-in · Parkly for Operators' };

export default async function MfaEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ backup?: string }>;
}) {
  const session = await requireSignedInMember();
  const backup = (await searchParams).backup === '1';

  // A user who already has a factor must prove it (aal2) before adding another.
  if (session.nextLevel === 'aal2' && session.currentLevel !== 'aal2') {
    redirect(`/mfa/verify?next=${encodeURIComponent('/mfa/enroll?backup=1')}`);
  }
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const existing = factors?.totp.length ?? 0;
  if (existing > 0 && !backup) redirect('/');

  return (
    <AuthPage title={existing === 0 ? 'Set up two-step sign-in' : 'Add a backup authenticator'}>
      <MfaEnrollFlow existingFactors={existing} />
    </AuthPage>
  );
}
