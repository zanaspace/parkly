'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from '../api';
import { publicEnv } from '../env';
import { createClient } from '../supabase/server';
import { getOrCreateDeviceId } from './device';
import { safeNext } from './guard';
import { AUTH_ERROR_MESSAGES, mapSupabaseAuthError } from '@parkly/contracts';
import {
  authErrorMessage,
  isEmailAddress,
  MIN_PASSWORD_LENGTH,
  signInErrorMessage,
} from './messages';

export type FormState = { error?: string; message?: string } | undefined;

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

// --- sign in ---------------------------------------------------------------

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: signInErrorMessage(error ?? {}) };

  // Records this browser against the new Supabase session and makes sure the profile exists.
  try {
    await apiFetch(publicEnv().apiUrl, '/v1/auth/bootstrap', data.session.access_token, {
      method: 'POST',
      body: { deviceId: await getOrCreateDeviceId(), platform: 'WEB' },
    });
  } catch {
    await supabase.auth.signOut({ scope: 'local' });
    return { error: 'We couldn’t reach Parkly just now. Please try again in a moment.' };
  }
  redirect(safeNext(field(form, 'next')));
}

// --- operator sign-up (doc 03 O-01) ------------------------------------------------

/**
 * Creates the login and sends Supabase's confirmation email. The answer is the
 * same whether or not the email already has an account (doc 05 §4.2). After
 * confirming, the link lands on /onboarding to create the operator, or back on
 * the invite page (`next`) for an invited manager.
 */
export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (!isEmailAddress(email)) return { error: 'Enter a valid email address.' };
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.` };
  if (password !== confirm) return { error: 'The two passwords don’t match.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // An invited manager returns to their invite; everyone else creates a business.
    options: {
      emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(safeNext(field(form, 'next'), '/onboarding'))}`,
    },
  });
  // Weak/leaked passwords and rate limits are safe to report; anything else gets the generic answer.
  const code = error ? mapSupabaseAuthError(error) : null;
  if (code === 'AUTH_PASSWORD_WEAK' || code === 'OTP_RATE_LIMITED' || code === 'AUTH_OTP_LOCKED')
    return { error: AUTH_ERROR_MESSAGES[code] };
  return {
    message:
      'Check your inbox: if this address can be used, we’ve sent a link to confirm it. The link expires in 1 hour.',
  };
}

// --- MFA (TOTP) --------------------------------------------------------------

export type EnrollStart = { factorId: string; qrCode: string; secret: string } | { error: string };

/** Starts TOTP enrolment. Abandoned unverified factors are removed first. */
export async function startEnrollment(): Promise<EnrollStart> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect('/sign-in');

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const verified = factors?.totp.length ?? 0;
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: verified === 0 ? 'Authenticator app' : `Backup authenticator ${verified + 1}`,
    issuer: 'Parkly',
  });
  if (error || !data) return { error: authErrorMessage(error ?? {}) };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export type EnrollConfirmState =
  { error?: string; done?: boolean; factorCount?: number } | undefined;

export async function confirmEnrollment(
  _prev: EnrollConfirmState,
  form: FormData,
): Promise<EnrollConfirmState> {
  const factorId = field(form, 'factorId');
  const code = field(form, 'code').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code))
    return { error: 'Enter the 6-digit code from your authenticator app.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error)
    return { error: authErrorMessage({ ...error, code: error.code ?? 'mfa_verification_failed' }) };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return { done: true, factorCount: factors?.totp.length ?? 1 };
}

/** Upgrades the session to aal2 with a code from any of the user's verified authenticators. */
export async function verifyMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const code = field(form, 'code').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code))
    return { error: 'Enter the 6-digit code from your authenticator app.' };

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: authErrorMessage(listError) };
  for (const factor of factors?.totp ?? []) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (!error) redirect(safeNext(field(form, 'next')));
  }
  return { error: authErrorMessage({ code: 'mfa_verification_failed' }) };
}

// --- password reset ------------------------------------------------------------

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, 'email').toLowerCase();
  if (!email.includes('@')) return { error: 'Enter the email address you sign in with.' };
  const supabase = await createClient();
  // The redirect URL must be on the project's Auth redirect allowlist.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/confirm?next=/update-password`,
  });
  // Same answer whether or not the account exists.
  return {
    message:
      'If an account uses that email, we’ve sent a link to reset the password. It expires in 30 minutes.',
  };
}

export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: 'The two passwords don’t match.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error) };
  // Doc 05 §4.2: after a reset, every other session is signed out.
  await supabase.auth.signOut({ scope: 'others' });
  redirect('/');
}

// --- sign out --------------------------------------------------------------------

/** FR-AUTH-006: this device, or every device (revokes all Supabase sessions). */
export async function signOut(form: FormData): Promise<void> {
  const scope = form.get('scope') === 'all' ? 'all' : 'device';
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    try {
      await apiFetch(publicEnv().apiUrl, '/v1/auth/sessions/revoke', session.access_token, {
        method: 'POST',
        body: { scope },
      });
    } catch {
      // Still clear the local session below even if the API is unreachable.
    }
  }
  await supabase.auth.signOut({ scope: scope === 'all' ? 'global' : 'local' });
  // e.g. the invite page: sign out of the wrong account, then sign back in to the invite.
  const next = field(form, 'next');
  redirect(next ? `/sign-in?next=${encodeURIComponent(safeNext(next))}` : '/sign-in');
}
