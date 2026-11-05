import { z } from 'zod';
import type { EmailMessage } from '../notifications/types.js';
import { brandedEmail, button, codeCard, esc, note, paragraph } from './layout.js';

/**
 * Supabase Send Email Hook payload (ADR 0022). Only the fields we use are
 * parsed; Supabase sends more. Holds one-time codes and link tokens: never log it.
 */
export const SendEmailPayloadSchema = z.object({
  user: z.object({
    email: z.string().optional().default(''),
    new_email: z.string().optional().default(''),
    user_metadata: z.record(z.string(), z.unknown()).optional().default({}),
  }),
  email_data: z.object({
    token: z.string().optional().default(''),
    token_hash: z.string().optional().default(''),
    token_new: z.string().optional().default(''),
    token_hash_new: z.string().optional().default(''),
    redirect_to: z.string().optional().default(''),
    site_url: z.string().optional().default(''),
    email_action_type: z.string().min(1),
  }),
});
export type SendEmailPayload = z.infer<typeof SendEmailPayloadSchema>;

/** Matches `otp_expiry = 300` in supabase/config.toml; it covers codes and links alike. */
export const AUTH_EMAIL_EXPIRY_MINUTES = 5;

const NOT_YOU = 'If you didn’t ask for this, you can ignore this email. Your account is safe.';

/**
 * The link Supabase would have put in {{ .ConfirmationURL }}: Supabase checks the
 * token, then sends the browser to `redirect_to` (our /auth/confirm), which works
 * for both the PKCE `code` and the `token_hash` flow.
 */
export function verifyUrl(
  supabaseUrl: string,
  tokenHash: string,
  type: string,
  redirectTo: string,
) {
  const params = new URLSearchParams({ token: tokenHash, type });
  if (redirectTo) params.set('redirect_to', redirectTo);
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1/verify?${params.toString()}`;
}

function codeEmail(
  to: string,
  code: string,
  opts: { subject: string; heading: string; intro: string },
): EmailMessage {
  const html = brandedEmail({
    title: opts.subject,
    preheader: `Your code expires in ${AUTH_EMAIL_EXPIRY_MINUTES} minutes.`,
    heading: opts.heading,
    body: [
      paragraph(esc(opts.intro)),
      codeCard('Your code', code),
      paragraph(
        `This code expires in <strong>${AUTH_EMAIL_EXPIRY_MINUTES} minutes</strong>. Never share it, not even with Parkly staff.`,
      ),
      note(esc(NOT_YOU)),
    ].join(''),
  });
  const text = `${opts.intro}\n\nYour code: ${code}\n\nIt expires in ${AUTH_EMAIL_EXPIRY_MINUTES} minutes. Never share it.\n\n${NOT_YOU}`;
  return { to, subject: opts.subject, html, text };
}

function linkEmail(
  to: string,
  link: string,
  opts: { subject: string; heading: string; intro: string; action: string; footnote?: string },
): EmailMessage {
  const html = brandedEmail({
    title: opts.subject,
    preheader: opts.intro,
    heading: opts.heading,
    body: [
      paragraph(esc(opts.intro)),
      button(opts.action, link),
      paragraph(
        `This link works once and expires in <strong>${AUTH_EMAIL_EXPIRY_MINUTES} minutes</strong>.`,
      ),
      note(esc(opts.footnote ?? NOT_YOU)),
    ].join(''),
  });
  const text = `${opts.intro}\n\n${opts.action}: ${link}\n\nThis link works once and expires in ${AUTH_EMAIL_EXPIRY_MINUTES} minutes.\n\n${opts.footnote ?? NOT_YOU}`;
  return { to, subject: opts.subject, html, text };
}

function noticeEmail(to: string, subject: string, heading: string, what: string): EmailMessage {
  const advice =
    'If this was you, there’s nothing to do. If it wasn’t, reset your password now and contact Parkly support.';
  const html = brandedEmail({
    title: subject,
    preheader: what,
    heading,
    body: [paragraph(esc(what)), paragraph(esc(advice))].join(''),
  });
  return { to, subject, html, text: `${what}\n\n${advice}` };
}

const NOTICES: Record<string, { subject: string; heading: string; what: string }> = {
  password_changed_notification: {
    subject: 'Your Parkly password was changed',
    heading: 'Password changed',
    what: 'The password for your Parkly account was just changed.',
  },
  email_changed_notification: {
    subject: 'Your Parkly email address was changed',
    heading: 'Email address changed',
    what: 'The email address on your Parkly account was just changed.',
  },
  phone_changed_notification: {
    subject: 'Your Parkly phone number was changed',
    heading: 'Phone number changed',
    what: 'The phone number on your Parkly account was just changed.',
  },
  identity_linked_notification: {
    subject: 'A sign-in method was added to your Parkly account',
    heading: 'New sign-in method',
    what: 'A new way to sign in was just added to your Parkly account.',
  },
  identity_unlinked_notification: {
    subject: 'A sign-in method was removed from your Parkly account',
    heading: 'Sign-in method removed',
    what: 'A way to sign in was just removed from your Parkly account.',
  },
  mfa_factor_enrolled_notification: {
    subject: 'Two-step sign-in was set up on your Parkly account',
    heading: 'Authenticator added',
    what: 'An authenticator app was just added to your Parkly account for two-step sign-in.',
  },
  mfa_factor_unenrolled_notification: {
    subject: 'Two-step sign-in was removed from your Parkly account',
    heading: 'Authenticator removed',
    what: 'An authenticator app was just removed from your Parkly account.',
  },
};

/**
 * Turns one Send Email Hook call into the emails to send. Returns null for an
 * action type we don't know, so the hook can refuse it rather than send nothing.
 */
export function renderAuthEmails(
  payload: SendEmailPayload,
  supabaseUrl: string,
): EmailMessage[] | null {
  const { user, email_data: d } = payload;
  const type = d.email_action_type;
  const link = (hash: string, linkType = type) =>
    verifyUrl(supabaseUrl, hash, linkType, d.redirect_to);

  switch (type) {
    // Drivers and attendants sign in with a 6-digit code (ADR 0015). A first
    // sign-in arrives as `signup`, a returning one as `magiclink`.
    case 'magiclink':
    case 'email':
      return [
        codeEmail(user.email, d.token, {
          subject: 'Your Parkly sign-in code',
          heading: 'Your sign-in code',
          intro: 'Enter this code in Parkly to finish signing in.',
        }),
      ];

    case 'signup':
      // Operators sign up with a password on the portal and confirm by link
      // (portal signUp sets `operator_signup`); everyone else gets the code.
      if (user.user_metadata.operator_signup === true)
        return [
          linkEmail(user.email, link(d.token_hash), {
            subject: 'Confirm your email for Parkly',
            heading: 'Confirm your email',
            intro:
              'Thanks for signing up to Parkly for car park operators. Confirm your email address to set up your business.',
            action: 'Confirm my email',
            footnote:
              'If you didn’t create a Parkly account, ignore this email and no account will be set up.',
          }),
        ];
      return [
        codeEmail(user.email, d.token, {
          subject: 'Your Parkly sign-in code',
          heading: 'Welcome to Parkly',
          intro: 'Enter this code in Parkly to finish creating your account.',
        }),
      ];

    case 'recovery':
      return [
        linkEmail(user.email, link(d.token_hash), {
          subject: 'Reset your Parkly password',
          heading: 'Reset your password',
          intro:
            'We got a request to reset the password for your Parkly account. Choose a new one with the button below.',
          action: 'Choose a new password',
          footnote:
            'If you didn’t ask to reset your password, ignore this email. Your password stays the same.',
        }),
      ];

    case 'invite':
      return [
        linkEmail(user.email, link(d.token_hash), {
          subject: 'You’re invited to Parkly',
          heading: 'You’re invited to Parkly',
          intro:
            'You’ve been invited to Parkly. Accept the invite to set your password and sign in.',
          action: 'Accept the invite',
          footnote: 'If you weren’t expecting this invite, ignore this email.',
        }),
      ];

    case 'reauthentication':
      return [
        codeEmail(user.email, d.token, {
          subject: 'Your Parkly confirmation code',
          heading: 'Confirm it’s you',
          intro: 'Enter this code in Parkly to confirm the change you’re making.',
        }),
      ];

    case 'email_change': {
      const confirm = (to: string, hash: string, current: boolean) =>
        linkEmail(to, link(hash), {
          subject: 'Confirm your new Parkly email address',
          heading: 'Confirm the email change',
          intro: current
            ? `Someone asked to change your Parkly email address to ${user.new_email}. Confirm it from this address too.`
            : 'Confirm this address to make it the email on your Parkly account.',
          action: 'Confirm the change',
          footnote: 'If you didn’t ask for this, ignore this email and nothing will change.',
        });
      // Supabase names are reversed for backward compatibility: `token_hash_new`
      // belongs to the CURRENT address, `token_hash` to the NEW one.
      if (d.token_hash_new)
        return [
          confirm(user.email, d.token_hash_new, true),
          confirm(user.new_email || user.email, d.token_hash, false),
        ];
      return [confirm(user.new_email || user.email, d.token_hash, false)];
    }

    default: {
      const notice = NOTICES[type];
      return notice ? [noticeEmail(user.email, notice.subject, notice.heading, notice.what)] : null;
    }
  }
}
