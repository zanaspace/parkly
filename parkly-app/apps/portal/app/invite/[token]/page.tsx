import { Text } from '@parkly/ui';
import Link from 'next/link';
import { AuthPage } from '../../../components/auth-page';
import { AcceptInviteForm } from '../../../components/team';
import { loadSession } from '../../../lib/auth/session';

export const metadata = { title: 'Join a team · Parkly for Operators' };

/**
 * Doc 03 §2.3 step 2. Anyone with the link lands here; the API accepts it only
 * for the account whose email or phone the invite was made for.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const here = `/invite/${encodeURIComponent(token)}`;
  const { signedIn } = await loadSession();
  return (
    <AuthPage
      title="You’ve been invited to a Parkly team"
      intro="Accept with the account for the email address (managers) or phone number (attendants) the invite was sent to."
    >
      {signedIn ? (
        <AcceptInviteForm inviteToken={token} />
      ) : (
        <>
          <Text>Managers: sign in, or create an account with the invited email address.</Text>
          <Link className="pk-link" href={`/sign-in?next=${encodeURIComponent(here)}`}>
            Sign in
          </Link>
          <Link className="pk-link" href={`/sign-up?next=${encodeURIComponent(here)}`}>
            Create an account
          </Link>
          <Text variant="body-sm" tone="tertiary">
            Attendants: keep this link. You’ll accept it in the Parkly attendant app with your phone
            number when it launches.
          </Text>
        </>
      )}
    </AuthPage>
  );
}
