import { AUTH_ERROR_MESSAGES, mapSupabaseAuthError } from '@parkly/contracts';
import { ApiError } from '../lib/api';
import { api } from '../lib/client';
import { getDeviceId } from '../lib/device';
import { supabase } from '../lib/supabase';

export type RequestCodeResult =
  { ok: true } | { ok: false; message: string; waitSeconds: number | null };

/**
 * D-02: ask our API whether a code may be sent (friendly early wait timer),
 * then ask Supabase Auth to send it. Supabase calls our Send SMS Hook, which
 * enforces the real limits.
 */
export async function requestCode(phone: string): Promise<RequestCodeResult> {
  try {
    await api.precheckOtp(phone, await getDeviceId());
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, message: err.message, waitSeconds: err.retryAfterSec };
    }
    return { ok: false, message: 'Could not send a code. Please try again.', waitSeconds: null };
  }

  const { error } = await supabase.auth.signInWithOtp({ phone });
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
