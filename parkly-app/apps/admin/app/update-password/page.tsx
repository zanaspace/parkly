import { redirect } from 'next/navigation';
import { AuthPage } from '../../components/auth-page';
import { UpdatePasswordForm } from '../../components/auth-forms';
import { loadSession } from '../../lib/auth/session';

export const metadata = { title: 'Choose a new password · Parkly Admin' };

export default async function UpdatePasswordPage() {
  const session = await loadSession();
  if (!session.signedIn) redirect('/reset-password?error=expired');
  // Supabase requires aal2 to change the password of an account with MFA.
  if (session.nextLevel === 'aal2' && session.currentLevel !== 'aal2') {
    redirect('/mfa/verify?next=/update-password');
  }
  return (
    <AuthPage title="Choose a new password" intro="Other devices will be signed out when you save.">
      <UpdatePasswordForm />
    </AuthPage>
  );
}
