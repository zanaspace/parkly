import { AUTH_ERROR_MESSAGES, mapSupabaseAuthError } from '@parkly/contracts';
import { ApiError } from '../lib/api';
import { api } from '../lib/client';
import { getDeviceId } from '../lib/device';
import { supabase } from '../lib/supabase';
import { isDevBypass } from './dev-auth';

export type RequestCodeResult =
  { ok: true } | { ok: false; message: string; waitSeconds: number | null };

/**
 * D-02: ask our API whether a code may be sent (friendly early wait timer),
 * then ask Supabase Auth to send it. Supabase calls our Send SMS Hook, which
 * enforces the real limits.
 */
export async function requestCode(
  phone: string,
  captchaToken?: string,
): Promise<RequestCodeResult> {
  try {
    await api.precheckOtp(phone, await getDeviceId());
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, message: err.message, waitSeconds: err.retryAfterSec };
    }
    return { ok: false, message: 'Could not send a code. Please try again.', waitSeconds: null };
  }

  // Bypass third-party paid SMS providers (e.g. Twilio) in development
  if (isDevBypass()) {
    return { ok: true };
  }

  const { error } = await supabase.auth.signInWithOtp({ phone, options: { captchaToken } });
  if (error) {
    const code = mapSupabaseAuthError({ code: error.code, status: error.status });
    return {
      ok: false,
      message: AUTH_ERROR_MESSAGES[code],
      waitSeconds: code === 'OTP_RATE_LIMITED' || code === 'AUTH_OTP_LOCKED' ? 60 : null,
    };
  }
  return { ok: true };
}

/**
 * ADR 0015: sign in with a 6-digit code sent by email (until SMS is live).
 * Supabase sends it; its email template must contain {{ .Token }} (doc 22).
 */
export async function requestEmailCode(
  email: string,
  captchaToken?: string,
): Promise<RequestCodeResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, captchaToken },
  });
  if (error) {
    const code = mapSupabaseAuthError({ code: error.code, status: error.status });
    return {
      ok: false,
      message: AUTH_ERROR_MESSAGES[code],
      waitSeconds: code === 'OTP_RATE_LIMITED' || code === 'AUTH_OTP_LOCKED' ? 60 : null,
    };
  }
  return { ok: true };
}
