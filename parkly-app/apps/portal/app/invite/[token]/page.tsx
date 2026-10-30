import type { InvitePreview } from '@parkly/contracts';
import { Button, Text } from '@parkly/ui';
import Link from 'next/link';
import { AuthPage } from '../../../components/auth-page';
import { CodeSignInForm } from '../../../components/code-sign-in';
import { AcceptInviteForm } from '../../../components/team';
import { signOut } from '../../../lib/auth/actions';
import { loadSession } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { invitePageCopy } from '../../../lib/team/copy';

export const metadata = { title: 'Join a team · Parkly for Operators' };

/** Public and token-gated: no sign-in needed to see who invited you. */
async function preview(inviteToken: string): Promise<InvitePreview> {
  try {
    const res = await fetch(`${publicEnv().apiUrl}/v1/invites/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteToken }),
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as InvitePreview) : { state: 'INVALID' };
  } catch {
    return { state: 'INVALID' };
  }
}

/**
 * Doc 03 §2.3 step 2. Shows who invited them and as what, then the right next
 * step: managers sign in (or sign up) with the invited email and accept;
 * attendants sign in with a code sent to the invited email or phone, which
 * also accepts the invite.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const here = `/invite/${encodeURIComponent(token)}`;
  const [session, invite] = await Promise.all([loadSession(), preview(token)]);
  const copy = invitePageCopy(invite);

  return (
    <AuthPage title={copy.title} intro={copy.body}>
      {copy.mode === 'manager' && !session.signedIn && (
        <>
          <Link className="pk-link" href={`/sign-in?next=${encodeURIComponent(here)}`}>
            I already have an account: sign in
          </Link>
          <Link className="pk-link" href={`/sign-up?next=${encodeURIComponent(here)}`}>
            Create an account with the invited email
          </Link>
        </>
      )}
      {copy.mode === 'attendant' && !session.signedIn && <CodeSignInForm inviteToken={token} />}
      {copy.mode !== 'closed' && session.signedIn && (
        <>
          <Text tone="secondary">
            Signed in as <strong>{session.email ?? session.phone ?? 'this account'}</strong>. If
            this isn’t the {copy.mode === 'manager' ? 'email' : 'email or phone number'} the invite
            was sent to, sign out and use that one.
          </Text>
          <AcceptInviteForm inviteToken={token} />
          <form action={signOut}>
            <input type="hidden" name="next" value={here} />
            <Button type="submit" variant="ghost" size="sm" fullWidth>
              Sign out and use another account
            </Button>
          </form>
        </>
      )}
      {copy.mode === 'closed' && (
        <Link className="pk-link" href="/">
          Go to Parkly for Operators
        </Link>
      )}
    </AuthPage>
  );
}
