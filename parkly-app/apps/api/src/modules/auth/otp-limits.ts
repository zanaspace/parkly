import type { LimitRule } from '../../middleware/rate-limit.js';

/**
 * OTP abuse limits (doc 05 §4.1, FR-AUTH-001). The Send SMS Hook counts sends
 * against the per-phone rules (authoritative, a client cannot skip it); the
 * precheck only peeks at them so the app can show a friendly wait timer, and
 * counts its own per-IP and per-device requests.
 */
export const OTP_PHONE_RULES: LimitRule[] = [
  { name: 'otp-phone-15m', limit: 3, windowSec: 15 * 60 },
  { name: 'otp-phone-1h', limit: 5, windowSec: 60 * 60 },
  { name: 'otp-phone-1d', limit: 10, windowSec: 24 * 60 * 60 },
];

export const OTP_PRECHECK_IP: LimitRule = {
  name: 'otp-precheck-ip',
  limit: 10,
  windowSec: 15 * 60,
};
export const OTP_PRECHECK_DEVICE: LimitRule = {
  name: 'otp-precheck-device',
  limit: 5,
  windowSec: 15 * 60,
};

export const otpPhoneKey = (e164: string) => `phone:${e164}`;
