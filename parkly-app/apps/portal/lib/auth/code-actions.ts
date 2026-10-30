'use server';

import {
  AUTH_ERROR_MESSAGES,
  captchaToken,
  mapSupabaseAuthError,
  type AcceptInviteResponse,
} from '@parkly/contracts';
import { normaliseNigerianPhone } from '@parkly/domain/phone';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { publicEnv } from '../env';
import { createClient } from '../supabase/server';
import { teamMessage } from '../team/copy';
import { getOrCreateDeviceId } from './device';
import { safeNext } from './guard';
import { isEmailAddress } from './messages';

/**
 * Attendants sign in with a 6-digit code, not a password (doc 05 §4.4). Email
 * first until SMS codes are live, as for drivers (ADR 0015); phone stays for
 * test numbers now and for SMS later.
 */
export type CodeMethod = 'email' | 'phone';

export type CodeSignInState = {
  step: 'start' | 'code';
  method: CodeMethod;
  /** The normalised email address or E.164 phone the code went to. */
  contact?: string;
  error?: string;
};

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

const methodOf = (form: FormData): CodeMethod =>
  field(form, 'method') === 'phone' ? 'phone' : 'email';

function contactOf(form: FormData, method: CodeMethod): string | null {
  const raw = field(form, 'contact');
  if (method === 'phone') return normaliseNigerianPhone(raw);
  const email = raw.toLowerCase();
  return email.length <= 254 && isEmailAddress(email) ? email : null;
}

const authMessage = (error: { code?: string; status?: number }) =>
  AUTH_ERROR_MESSAGES[mapSupabaseAuthError({ code: error.code, status: error.status })];

/** Step 1: send the code. Phone goes through the API's precheck first, as on the driver website. */
export async function sendSignInCode(
  _prev: CodeSignInState,
  form: FormData,
): Promise<CodeSignInState> {
  const method = methodOf(form);
  const contact = contactOf(form, method);
  if (!contact)
    return {
      step: 'start',
      method,
      error:
        method === 'email'
          ? 'Enter a valid email address.'
          : 'Enter a Nigerian mobile number, like 0803 123 4567.',
    };
  const supabase = await createClient();
  if (method === 'email') {
    const { error } = await supabase.auth.signInWithOtp({
      email: contact,
      options: { shouldCreateUser: true, captchaToken: captchaToken(form) },
    });
    if (error) return { step: 'start', method, error: authMessage(error) };
    return { step: 'code', method, contact };
  }
  // Public route: no access token yet.
  const precheck = await fetch(`${publicEnv().apiUrl}/v1/auth/otp/precheck`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: contact, deviceId: await getOrCreateDeviceId() }),
    cache: 'no-store',
  }).catch(() => null);
  if (!precheck?.ok)
    return {
      step: 'start',
      method,
      error:
        precheck?.status === 429
          ? 'You’ve asked for several codes. Please wait a few minutes and try again.'
          : 'We couldn’t send a code just now. Please try again.',
    };
  const { error } = await supabase.auth.signInWithOtp({
    phone: contact,
    options: { captchaToken: captchaToken(form) },
  });
  if (error) return { step: 'start', method, error: authMessage(error) };
  return { step: 'code', method, contact };
}

/**
 * Step 2: check the code and start the session. With an invite token, accept
 * the invite too: the API checks it was sent to this email or phone.
 */
export async function verifySignInCode(
  _prev: CodeSignInState,
  form: FormData,
): Promise<CodeSignInState> {
  const method = methodOf(form);
  const contact = contactOf(form, method);
  const token = field(form, 'code');
  if (!contact) return { step: 'start', method, error: 'Start again with your details.' };
  const retry = (error: string): CodeSignInState => ({ step: 'code', method, contact, error });
  if (!/^\d{6}$/.test(token)) return retry('Enter the 6-digit code.');

  const supabase = await createClient();
  const { data, error } =
    method === 'email'
      ? await supabase.auth.verifyOtp({ email: contact, token, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: contact, token, type: 'sms' });
  if (error || !data.session)
    return retry(error ? authMessage(error) : 'That code didn’t work. Try again.');

  const accessToken = data.session.access_token;
  try {
    // No asDriver: an email sign-up here gets its role from the invite, never from the email.
    await apiFetch(publicEnv().apiUrl, '/v1/auth/bootstrap', accessToken, {
      method: 'POST',
      body: { deviceId: await getOrCreateDeviceId(), platform: 'WEB' },
    });
  } catch {
    await supabase.auth.signOut({ scope: 'local' });
    return { step: 'start', method, error: 'We couldn’t reach Parkly just now. Please try again.' };
  }

  const inviteToken = field(form, 'inviteToken');
  if (!inviteToken) redirect(safeNext(field(form, 'next'), '/attend'));

  let joined: AcceptInviteResponse;
  try {
    joined = await apiFetch(publicEnv().apiUrl, '/v1/auth/invites/accept', accessToken, {
      method: 'POST',
      body: { inviteToken },
    });
  } catch (err) {
    // Wrong email or phone for this invite: sign out so they can try the right one.
    await supabase.auth.signOut({ scope: 'local' });
    return {
      step: 'start',
      method,
      error: teamMessage(err instanceof ApiProblem ? err.code : undefined),
    };
  }
  redirect(joined.role === 'ATTENDANT' ? '/invite/joined' : '/');
}
