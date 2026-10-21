import type { ErrorCode, MemberRole } from '@parkly/contracts';

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
