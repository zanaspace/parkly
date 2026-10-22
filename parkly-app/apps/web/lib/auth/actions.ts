'use server';

import { AUTH_ERROR_MESSAGES, mapSupabaseAuthError, type Me } from '@parkly/contracts';
import { normaliseNigerianPhone } from '@parkly/domain/phone';
import { redirect } from 'next/navigation';
import { api, apiAs, ApiProblem } from '../api';
import { safeNext } from '../session';
import { createClient } from '../supabase/server';
import { getOrCreateDeviceId } from './device';

export type SignInState = {
  step: 'phone' | 'code';
  phone?: string;
  error?: string;
};

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/**
 * Step 1 (doc 03 D-02): our API's precheck gives a friendly wait before
 * Supabase sends the SMS; Supabase's Send SMS hook enforces the real limits.
 */
export async function sendCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const phone = normaliseNigerianPhone(field(form, 'phone'));
  if (!phone)
    return { step: 'phone', error: 'Enter a Nigerian mobile number, like 0803 123 4567.' };
  try {
    await api('/v1/auth/otp/precheck', {
      method: 'POST',
      body: { phone, deviceId: await getOrCreateDeviceId() },
    });
  } catch (err) {
    const wait = err instanceof ApiProblem && err.status === 429;
    return {
      step: 'phone',
      error: wait
        ? 'You’ve asked for several codes. Please wait a few minutes and try again.'
        : 'We couldn’t send a code just now. Please try again.',
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error)
    return {
      step: 'phone',
      error: AUTH_ERROR_MESSAGES[mapSupabaseAuthError({ code: error.code, status: error.status })],
    };
  return { step: 'code', phone };
}

/** Step 2: check the code, start the Parkly session and record terms on first sign-in. */
export async function verifyCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const phone = normaliseNigerianPhone(field(form, 'phone'));
  const token = field(form, 'code');
  if (!phone) return { step: 'phone', error: 'Enter your number again.' };
  if (!/^\d{6}$/.test(token)) return { step: 'code', phone, error: 'Enter the 6-digit code.' };
  if (form.get('terms') !== 'on')
    return {
      step: 'code',
      phone,
      error: 'Please accept the Terms and Privacy Policy to continue.',
    };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error || !data.session)
    return {
      step: 'code',
      phone,
      error: error
        ? AUTH_ERROR_MESSAGES[mapSupabaseAuthError({ code: error.code, status: error.status })]
        : 'That code didn’t work. Try again.',
    };

  const accessToken = data.session.access_token;
  try {
    const { user } = await apiAs<{ user: Me }>(accessToken, '/v1/auth/bootstrap', {
      method: 'POST',
      body: { deviceId: await getOrCreateDeviceId(), platform: 'WEB' },
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
    return { step: 'phone', error: 'We couldn’t reach Parkly just now. Please try again.' };
  }
  redirect(safeNext(field(form, 'next')));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/');
}
