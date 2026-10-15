import type { ErrorCode } from '@parkly/contracts';

/**
 * Friendly copy for API problem codes the driver app can hit (doc 04 voice:
 * plain, calm, says what to do next). Unknown codes fall back to a generic line.
 */
const COPY: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Some details aren’t right. Check the highlighted fields.',
  AUTH_PHONE_INVALID: 'Enter a valid Nigerian mobile number.',
  OTP_RATE_LIMITED: 'You’ve asked for several codes. Please wait before requesting another.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  AUTH_REQUIRED: 'Your session has ended. Please sign in again.',
  AUTH_ACCOUNT_LOCKED: 'This account is locked. Please contact support.',
  PLATE_INVALID: 'That doesn’t look like a plate number. Check it and try again.',
  VEHICLE_DUPLICATE: 'This plate is already on your account.',
  VEHICLE_LIMIT_REACHED: 'You can save up to 5 vehicles. Remove one to add another.',
  VEHICLE_IN_USE: 'This vehicle has an active booking, so it can’t be removed yet.',
  DSR_ALREADY_OPEN: 'You already have a deletion request in progress.',
  ACCOUNT_HAS_OBLIGATIONS: 'Finish or cancel your active bookings before deleting your account.',
  NOT_FOUND: 'We couldn’t find that. It may have been removed.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  SERVICE_UNAVAILABLE: 'Parkly is temporarily unavailable. Please try again shortly.',
};

export const NETWORK_ERROR_MESSAGE = 'You seem to be offline. Check your connection and try again.';
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function messageForCode(code: string | undefined): string {
  if (!code) return GENERIC_ERROR_MESSAGE;
  return COPY[code as ErrorCode] ?? GENERIC_ERROR_MESSAGE;
}
