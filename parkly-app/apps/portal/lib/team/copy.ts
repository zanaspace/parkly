import type { ErrorCode, InvitePreview, MemberRole } from '@parkly/contracts';

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  ATTENDANT: 'Attendant',
};

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  MEMBER_EXISTS: 'This person is already on your team or has an open invite.',
  FORBIDDEN_ROLE_GRANT: 'Only the owner can invite managers.',
  FORBIDDEN: 'Only the owner can do this.',
  INVITE_INVALID:
    'This invite link isn’t valid for this account. Sign in with the email or phone number the invite was sent to, or ask for a new link.',
  INVITE_EXPIRED: 'This invite has expired. Ask the business to send a new one.',
  INVALID_STATE_TRANSITION: 'The owner can’t be removed.',
};

export function teamMessage(code: string | undefined): string {
  return (code && MESSAGES[code as ErrorCode]) ?? 'Something went wrong. Please try again.';
}

/** The link the inviter shares; the token is in the path, never logged by the API. */
export const inviteLink = (origin: string, token: string) =>
  `${origin}/invite/${encodeURIComponent(token)}`;

/** Doc 03 §2.3 sends the link by SMS; until SMS is live the inviter shares it (e.g. WhatsApp). */
export function whatsappShare(link: string, businessName: string): string {
  const text = `You’ve been invited to join ${businessName} on Parkly. Open this link within 72 hours to accept: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type InvitePageCopy = {
  title: string;
  body: string;
  /** manager: sign in / sign up / accept; attendant: app instructions only; closed: nothing to do. */
  mode: 'manager' | 'attendant' | 'closed';
};

/** Doc 03 §2.3 step 2: say who invited them, as what, and what to do next. */
export function invitePageCopy(preview: InvitePreview): InvitePageCopy {
  switch (preview.state) {
    case 'INVALID':
      return {
        title: 'This invite link doesn’t work',
        body: 'It may have been used already or cancelled. Ask the business to send you a new invite.',
        mode: 'closed',
      };
    case 'EXPIRED':
      return {
        title: `Your invite to ${preview.businessName} has expired`,
        body: 'Invite links last 72 hours. Ask them to send you a new one.',
        mode: 'closed',
      };
    case 'OPEN':
      return preview.role === 'ATTENDANT'
        ? {
            title: `${preview.businessName} has invited you as an attendant`,
            body: 'Attendants accept the invite in the Parkly attendant app, signing in with the phone number the invite was sent to. Keep this link until the app is ready; you don’t need to create an account here.',
            mode: 'attendant',
          }
        : {
            title: `${preview.businessName} has invited you as a manager`,
            body: 'Sign in, or create an account, with the email address this invite was sent to. Then accept the invite and set up your authenticator app.',
            mode: 'manager',
          };
  }
}
