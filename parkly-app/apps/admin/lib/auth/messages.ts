import { AUTH_ERROR_MESSAGES, mapSupabaseAuthError } from '@parkly/contracts';

/**
 * User-facing copy for a Supabase Auth error. Sign-in failures always read the
 * same, so the form never reveals whether an account exists (doc 05 §4.2).
 */
export function authErrorMessage(error: {
  code?: string | undefined;
  status?: number | undefined;
}): string {
  return AUTH_ERROR_MESSAGES[mapSupabaseAuthError(error)];
}

export function signInErrorMessage(error: {
  code?: string | undefined;
  status?: number | undefined;
}): string {
  const code = mapSupabaseAuthError(error);
  if (code === 'AUTH_OTP_LOCKED' || code === 'OTP_RATE_LIMITED')
    return AUTH_ERROR_MESSAGES.AUTH_OTP_LOCKED;
  if (code === 'AUTH_CAPTCHA_FAILED') return AUTH_ERROR_MESSAGES.AUTH_CAPTCHA_FAILED;
  // Unknown users, wrong passwords and unconfirmed emails all get the same message.
  return AUTH_ERROR_MESSAGES.AUTH_INVALID_CREDENTIALS;
}

export const MIN_PASSWORD_LENGTH = 12;
