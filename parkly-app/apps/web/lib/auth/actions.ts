'use server';

import {
  AUTH_ERROR_MESSAGES,
  captchaToken,
  mapSupabaseAuthError,
  type Me,
} from '@parkly/contracts';
import { normaliseNigerianPhone } from '@parkly/domain/phone';
import { redirect } from 'next/navigation';
import { api, apiAs, ApiProblem } from '../api';
import { safeNext } from '../session';
import { createClient } from '../supabase/server';
import { getOrCreateDeviceId } from './device';

/** Email first until SMS codes are live (ADR 0015); phone stays for test numbers. */
export type SignInMethod = 'email' | 'phone';

export type SignInState = {
  step: 'start' | 'code';
  method: SignInMethod;
  /** The normalised email address or E.164 phone the code went to. */
  contact?: string;
  error?: string;
};

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const methodOf = (form: FormData): SignInMethod =>
  field(form, 'method') === 'phone' ? 'phone' : 'email';

function contactOf(form: FormData, method: SignInMethod): string | null {
  const raw = field(form, 'contact');
  if (method === 'phone') return normaliseNigerianPhone(raw);
  const email = raw.toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

const authMessage = (error: { code?: string; status?: number }) =>
  AUTH_ERROR_MESSAGES[mapSupabaseAuthError({ code: error.code, status: error.status })];

/**
 * Step 1 (doc 03 D-02). Phone: our API's precheck gives a friendly wait before
 * Supabase sends the SMS. Email: Supabase sends the code and applies its own
 * email limits.
 */
export async function sendCode(_prev: SignInState, form: FormData): Promise<SignInState> {
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
  try {
    await api('/v1/auth/otp/precheck', {
      method: 'POST',
      body: { phone: contact, deviceId: await getOrCreateDeviceId() },
    });
  } catch (err) {
    const wait = err instanceof ApiProblem && err.status === 429;
    return {
      step: 'start',
      method,
      error: wait
        ? 'You’ve asked for several codes. Please wait a few minutes and try again.'
        : 'We couldn’t send a code just now. Please try again.',
    };
  }
  const { error } = await supabase.auth.signInWithOtp({
    phone: contact,
    options: { captchaToken: captchaToken(form) },
  });
  if (error) return { step: 'start', method, error: authMessage(error) };
  return { step: 'code', method, contact };
}

/** Step 2: check the code, start the Parkly session and record terms on first sign-in. */
export async function verifyCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const method = methodOf(form);
  const contact = contactOf(form, method);
  const token = field(form, 'code');
  if (!contact) return { step: 'start', method, error: 'Start again with your details.' };
  const retry = (error: string): SignInState => ({ step: 'code', method, contact, error });
  if (!/^\d{6}$/.test(token)) return retry('Enter the 6-digit code.');
  if (form.get('terms') !== 'on')
    return retry('Please accept the Terms and Privacy Policy to continue.');

  const supabase = await createClient();
  const { data, error } =
    method === 'email'
      ? await supabase.auth.verifyOtp({ email: contact, token, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: contact, token, type: 'sms' });
  if (error || !data.session)
    return retry(error ? authMessage(error) : 'That code didn’t work. Try again.');

  const accessToken = data.session.access_token;
  try {
    const { user } = await apiAs<{ user: Me }>(accessToken, '/v1/auth/bootstrap', {
      method: 'POST',
      // The driver website: an email sign-up becomes a driver (ADR 0015).
      body: { deviceId: await getOrCreateDeviceId(), platform: 'WEB', asDriver: true },
    });
    const v = user.currentLegalVersions;
    if (user.consents.termsVersion !== v.terms)
      await apiAs(accessToken, '/v1/me/consents', {
        method: 'POST',
        body: { type: 'TERMS', version: v.terms, granted: true },
      });
    if (user.consents.privacyVersion !== v.privacy)
      await apiAs(accessToken, '/v1/me/consents', {
        method: 'POST',
        body: { type: 'PRIVACY', version: v.privacy, granted: true },
      });
  } catch {
    await supabase.auth.signOut({ scope: 'local' });
    return { step: 'start', method, error: 'We couldn’t reach Parkly just now. Please try again.' };
  }
  redirect(safeNext(field(form, 'next')));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/');
}
