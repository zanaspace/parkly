import { isBookingCode } from '../codes/booking-code.js';
import { normaliseNigerianPhone } from '../phone/phone.js';
import { isValidPlate, normalisePlate } from '../plate/plate.js';

/** What support typed, worked out so one box finds a booking (FR-ADM-002). */
export type SupportQuery =
  | { kind: 'CODE'; code: string }
  | { kind: 'REFERENCE'; reference: string }
  | { kind: 'PHONE'; phone: string }
  /** `alsoCode`: six characters that are also a booking code typed without "PK-". */
  | { kind: 'PLATE'; plateNorm: string; alsoCode?: string }
  | { kind: 'INVALID' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Booking code ("PK-AB12CD", any case, dash optional), payment reference (our
 * payment id, a UUID), Nigerian mobile (any common spelling) or plate, in that
 * order: a code or UUID can't be a phone, and a phone is checked before a
 * plate because 080… numbers would otherwise read as plates.
 */
export function classifySupportQuery(raw: string): SupportQuery {
  const text = raw.trim();
  if (text.length < 4 || text.length > 100) return { kind: 'INVALID' };
  const compact = text.toUpperCase().replace(/[\s-]/g, '');
  const code = compact.startsWith('PK') ? `PK-${compact.slice(2)}` : `PK-${compact}`;
  if (compact.startsWith('PK') && isBookingCode(code)) return { kind: 'CODE', code };
  if (UUID.test(text)) return { kind: 'REFERENCE', reference: text.toLowerCase() };
  const phone = normaliseNigerianPhone(text);
  if (phone) return { kind: 'PHONE', phone };
  if (isValidPlate(text)) {
    const plateNorm = normalisePlate(text);
    return isBookingCode(code)
      ? { kind: 'PLATE', plateNorm, alsoCode: code }
      : { kind: 'PLATE', plateNorm };
  }
  if (isBookingCode(code)) return { kind: 'CODE', code };
  return { kind: 'INVALID' };
}

/** "+234 *** *** 4567" from the last four digits; staff see this until they reveal. */
export function maskedPhoneFromLast4(last4: string | null): string | null {
  return last4 && /^\d{4}$/.test(last4) ? `+234 *** *** ${last4}` : null;
}
