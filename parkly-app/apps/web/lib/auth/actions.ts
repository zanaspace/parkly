'use server';

import {
  AUTH_ERROR_MESSAGES,
  captchaToken,
  mapSupabaseAuthError,
  type Me,
} from '@parkly/contracts';
import { normaliseNigerianPhone } from '@parkly/domain/phone';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, apiAs, ApiProblem } from '../api';
import { resolveWorkspaces } from '../platform-router';
import { safeNext } from '../session';
import { createClient } from '../supabase/server';
import { getOrCreateDeviceId } from './device';

/** Email first until SMS codes are live (ADR 0015); phone stays for test numbers; corp-driver for fleet join codes. */
export type SignInMethod = 'email' | 'phone' | 'corp-driver';

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
 * Supabase sends the SMS. Email: Supabase hands the code to our Send Email Hook,
 * which sends it through Resend and applies per-account limits (ADR 0022).
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
    if (error) {
      if (error.code === 'over_request_rate_limit') {
        return {
          step: 'start',
          method,
          error:
            'Too many code attempts for this email. Please wait a few minutes before trying again, or sign in using your Corporate Join Code below if registered with a corporate fleet.',
        };
      }
      return { step: 'start', method, error: authMessage(error) };
    }
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
  let user: Me;
  try {
    const bootstrap = await apiAs<{ user: Me }>(accessToken, '/v1/auth/bootstrap', {
      method: 'POST',
      // The driver website: an email sign-up becomes a driver (ADR 0015).
      body: { deviceId: await getOrCreateDeviceId(), platform: 'WEB', asDriver: true },
    });
    user = bootstrap.user;
    try {
      const v = user.currentLegalVersions;
      if (user.consents.termsVersion !== v.terms && v.terms && v.terms !== 'unset')
        await apiAs(accessToken, '/v1/me/consents', {
          method: 'POST',
          body: { type: 'TERMS', version: v.terms, granted: true },
        });
      if (user.consents.privacyVersion !== v.privacy && v.privacy && v.privacy !== 'unset')
        await apiAs(accessToken, '/v1/me/consents', {
          method: 'POST',
          body: { type: 'PRIVACY', version: v.privacy, granted: true },
        });
    } catch {
      // Non-fatal: could not sync consents during sign-in
    }
  } catch (err: unknown) {
    await supabase.auth.signOut({ scope: 'local' });
    const detail =
      err instanceof ApiProblem
        ? ` (${err.code}: ${err.detail || err.status})`
        : err instanceof Error
          ? ` (${err.message})`
          : '';
    return {
      step: 'start',
      method,
      error: `We couldn’t reach Parkly just now${detail}. Please try again.`,
    };
  }

  const explicitNext = safeNext(field(form, 'next'), '');
  let destination = explicitNext;

  if (!destination || destination === '/bookings') {
    const workspaces = resolveWorkspaces(user);
    const nonDriverWorkspaces = workspaces.filter((w) => w.type !== 'driver');
    if (nonDriverWorkspaces.length > 0 && workspaces.length > 1) {
      destination = '/auth/choose-workspace';
    } else if (nonDriverWorkspaces.length === 1 && workspaces.length === 1) {
      destination = nonDriverWorkspaces[0]?.url || '/bookings';
    } else {
      destination = '/bookings';
    }
  }

  redirect(destination);
}

/** Step 1 for corporate drivers: direct phone + join code authentication without SMS OTP. */
export async function loginCorporateDriver(
  _prev: SignInState,
  form: FormData,
): Promise<SignInState> {
  const rawContact = field(form, 'contact');
  const rawCode = field(form, 'joinCode').toUpperCase();
  const phone = normaliseNigerianPhone(rawContact);
  if (!phone) {
    return {
      step: 'start',
      method: 'corp-driver',
      error: 'Enter a valid Nigerian mobile number, like 0803 123 4567.',
    };
  }
  if (!rawCode || rawCode.length < 4) {
    return {
      step: 'start',
      method: 'corp-driver',
      error: 'Enter your 6-character Join Code (e.g. SEL-2805).',
    };
  }
  if (form.get('terms') !== 'on') {
    return {
      step: 'start',
      method: 'corp-driver',
      error: 'Please accept the Terms and Privacy Policy to continue.',
    };
  }

  let res: {
    token: string;
    driver: { id: string; driverName: string; phone: string; vehiclePlate: string | null };
    corporate: { id: string; slug: string; legalName: string };
  };

  try {
    res = await api<{
      token: string;
      driver: { id: string; driverName: string; phone: string; vehiclePlate: string | null };
      corporate: { id: string; slug: string; legalName: string };
    }>('/v1/corp/drivers/login', {
      method: 'POST',
      body: { phone, joinCode: rawCode },
    });
  } catch (err: unknown) {
    const msg =
      err instanceof ApiProblem && err.detail
        ? err.detail
        : 'Invalid join code or phone number. Check with your fleet administrator.';
    return { step: 'start', method: 'corp-driver', error: msg };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    'pk_corp_driver',
    JSON.stringify({
      token: res.token,
      userId: res.driver.id,
      phone: res.driver.phone,
      corporateSlug: res.corporate.slug,
    }),
    {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 3600,
    },
  );

  const explicitNext = safeNext(field(form, 'next'), '');
  let destination = explicitNext;
  if (!destination || destination === '/bookings') {
    destination = '/bookings';
  }
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  const cookieStore = await cookies();
  cookieStore.delete('pk_corp_driver');
  redirect('/');
}
