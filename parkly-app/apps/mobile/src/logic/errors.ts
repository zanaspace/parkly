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
  LOT_NOT_FOUND: 'This car park isn’t listed right now. Search again for others nearby.',
  SEARCH_INVALID_WINDOW: 'Pick a start time from now up to 30 days ahead, for at most 24 hours.',
  BOOKING_WINDOW_INVALID: 'Pick a start time from now up to 30 days ahead, for at most 24 hours.',
  BOOKING_OUTSIDE_OPENING_HOURS:
    'The car park is closed for part of that time. Check its opening hours.',
  PRICING_INVALID_DURATION: 'That stay is shorter than this car park’s minimum.',
  LOT_NOT_BOOKABLE: 'This car park can’t take bookings for that right now.',
  BOOKING_SLOT_UNAVAILABLE: 'Sorry, that time just filled up. Try another time or car park.',
  BOOKING_OVERLAP_SAME_VEHICLE: 'This car already has a booking at that time. See My bookings.',
  BOOKING_NOT_FOUND: 'We couldn’t find that booking.',
  PAYMENT_NOT_FOUND: 'We couldn’t find that payment.',
  PAYMENT_PROVIDER_UNAVAILABLE:
    'Payments aren’t reachable right now. Nothing was charged. Please try again.',
  IDEMPOTENCY_IN_PROGRESS: 'We’re still working on your booking. One moment.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  SERVICE_UNAVAILABLE: 'Parkly is temporarily unavailable. Please try again shortly.',
};

export const NETWORK_ERROR_MESSAGE = 'You seem to be offline. Check your connection and try again.';
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function messageForCode(code: string | undefined): string {
  if (!code) return GENERIC_ERROR_MESSAGE;
  return COPY[code as ErrorCode] ?? GENERIC_ERROR_MESSAGE;
}
