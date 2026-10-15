/**
 * Sign-in errors come from Supabase Auth on the client, not from our API
 * (doc 02 §11). Every app maps them through this one function so users see
 * the same messages everywhere.
 */
export type ClientAuthErrorCode =
  | 'AUTH_PHONE_INVALID'
  | 'AUTH_OTP_INVALID'
  | 'AUTH_OTP_EXPIRED'
  | 'AUTH_OTP_LOCKED'
  | 'OTP_RATE_LIMITED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_MFA_INVALID'
  | 'AUTH_REFRESH_INVALID'
  | 'AUTH_PASSWORD_WEAK'
  | 'AUTH_RESET_INVALID'
  | 'AUTH_UNKNOWN';

const BY_SUPABASE_CODE: Record<string, ClientAuthErrorCode> = {
  otp_expired: 'AUTH_OTP_EXPIRED',
  otp_disabled: 'AUTH_PHONE_INVALID',
  validation_failed: 'AUTH_PHONE_INVALID',
  sms_send_failed: 'OTP_RATE_LIMITED',
  hook_payload_invalid_content_type: 'AUTH_UNKNOWN',
  over_sms_send_rate_limit: 'OTP_RATE_LIMITED',
  over_request_rate_limit: 'AUTH_OTP_LOCKED',
  invalid_credentials: 'AUTH_INVALID_CREDENTIALS',
  mfa_verification_failed: 'AUTH_MFA_INVALID',
  mfa_challenge_expired: 'AUTH_MFA_INVALID',
  refresh_token_not_found: 'AUTH_REFRESH_INVALID',
  refresh_token_already_used: 'AUTH_REFRESH_INVALID',
  session_not_found: 'AUTH_REFRESH_INVALID',
  weak_password: 'AUTH_PASSWORD_WEAK',
  same_password: 'AUTH_PASSWORD_WEAK',
  flow_state_expired: 'AUTH_RESET_INVALID',
};

export const AUTH_ERROR_MESSAGES: Record<ClientAuthErrorCode, string> = {
  AUTH_PHONE_INVALID: 'Enter a valid Nigerian mobile number.',
  AUTH_OTP_INVALID: 'That code isn’t right. Check the SMS and try again.',
  AUTH_OTP_EXPIRED: 'That code has expired. Request a new one.',
  AUTH_OTP_LOCKED: 'Too many attempts. Please wait a few minutes and try again.',
  OTP_RATE_LIMITED: 'You’ve asked for several codes. Please wait before requesting another.',
  AUTH_INVALID_CREDENTIALS: 'Email or password is incorrect.',
  AUTH_MFA_INVALID: 'That authenticator code isn’t right. Try the latest code.',
  AUTH_REFRESH_INVALID: 'Your session has ended. Please sign in again.',
  AUTH_PASSWORD_WEAK: 'Choose a longer password that isn’t easy to guess.',
  AUTH_RESET_INVALID: 'This reset link has expired. Request a new one.',
  AUTH_UNKNOWN: 'Something went wrong signing you in. Please try again.',
};

/** Accepts a Supabase AuthError-like object ({ code?, status?, message? }). */
export function mapSupabaseAuthError(error: {
  code?: string | undefined;
  status?: number | undefined;
}): ClientAuthErrorCode {
  const mapped = error.code ? BY_SUPABASE_CODE[error.code] : undefined;
  if (mapped) return mapped;
  // Supabase returns 403 "Token has expired or is invalid" for a wrong OTP.
  if (error.status === 403) return 'AUTH_OTP_INVALID';
  if (error.status === 429) return 'AUTH_OTP_LOCKED';
  return 'AUTH_UNKNOWN';
}
