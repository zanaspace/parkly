import { normaliseNigerianPhone } from '@parkly/domain/phone';
import { isValidPlate, normalisePlate } from '@parkly/domain/plate';

/**
 * The phone field shows a fixed "+234" prefix; drivers may still type the
 * leading 0 or the full number (doc 03 §1.1 D-02).
 */
export function phoneFromInput(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, '');
  if (digits.startsWith('+') || digits.startsWith('234') || digits.startsWith('0')) {
    return normaliseNigerianPhone(digits);
  }
  return normaliseNigerianPhone(`+234${digits}`);
}

/** "+2348031234567" → "+234 803 123 4567" for display on the OTP screen. */
export function formatPhone(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

// Same rule as the API (contracts UpdateMeRequestSchema), plus the doc 03 D-04 minimum of 2.
const NAME = /^[\p{L}\p{M}' .-]+$/u;

export function nameError(value: string, field: 'First name' | 'Last name'): string | null {
  const v = value.trim();
  if (v.length === 0) return `${field} is required.`;
  if (v.length < 2) return `${field} must be at least 2 letters.`;
  if (v.length > 50) return `${field} must be 50 characters or fewer.`;
  if (!NAME.test(v)) return `${field} can only contain letters, spaces, apostrophes and hyphens.`;
  return null;
}

export type PlateCheck = { normalised: string; valid: boolean };

/** Live preview of how the gate will see the plate (D-05). */
export function checkPlate(raw: string): PlateCheck {
  return { normalised: normalisePlate(raw.trim()), valid: isValidPlate(raw.trim()) };
}

export const OTP_LENGTH = 6;

/** Keeps only digits and caps at 6, so paste and autofill both work. */
export function sanitiseOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function platformFor(os: string): 'ANDROID' | 'IOS' | 'WEB' {
  if (os === 'android') return 'ANDROID';
  if (os === 'ios') return 'IOS';
  return 'WEB';
}
