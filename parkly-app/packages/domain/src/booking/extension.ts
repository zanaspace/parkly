import { mulDivRoundHalfUp, type Kobo } from '../money/money.js';
import { quote, type RatePlanPrices } from '../pricing/quote.js';
import { isSlotAligned } from '../time/slots.js';
import type { BookingStatus } from './booking.js';

export type ExtensionSettings = {
  commissionBps: number;
};

export type ExtensionWindowValidation =
  | { ok: true; addedMinutes: number; totalMinutes: number }
  | {
      ok: false;
      code:
        | 'EXTENSION_NOT_LATER'
        | 'EXTENSION_NOT_SLOT_ALIGNED'
        | 'EXTENSION_EXCEEDS_MAX_DURATION'
        | 'EXTENSION_TOO_LATE'
        | 'BOOKING_NOT_EXTENDABLE';
    };

export type ExtensionQuote = {
  addedMinutes: number;
  priceKobo: Kobo;
  serviceFeeKobo: 0;
  totalKobo: Kobo;
  commissionKobo: Kobo;
  operatorAmountKobo: Kobo;
};

const MINUTE_MS = 60_000;

/**
 * Validates whether an extension window meets scheduling, status, and grid rules (FR-BOOK-005, doc 02 §4).
 */
export function validateExtensionWindow(input: {
  startAt: Date;
  currentEndAt: Date;
  newEndAt: Date;
  now: Date;
  status: BookingStatus;
  maxDurationMinutes: number;
  /** Overstay grace: past end + grace the time already used is overstay, not extension. */
  graceMin?: number;
  /** 5-minute test extensions; switched on only outside prod (gap review L-2). */
  allowTestStays?: boolean;
}): ExtensionWindowValidation {
  const { startAt, currentEndAt, newEndAt, now, status, maxDurationMinutes } = input;

  // Only CONFIRMED or CHECKED_IN bookings can be extended
  if (status !== 'CONFIRMED' && status !== 'CHECKED_IN') {
    return { ok: false, code: 'BOOKING_NOT_EXTENDABLE' };
  }

  // newEndAt must be strictly greater than currentEndAt
  if (newEndAt.getTime() <= currentEndAt.getTime()) {
    return { ok: false, code: 'EXTENSION_NOT_LATER' };
  }

  // Extending over time already spent would bill overstay at the normal rate (ADR 0016).
  if (now.getTime() > currentEndAt.getTime() + (input.graceMin ?? 0) * MINUTE_MS) {
    return { ok: false, code: 'EXTENSION_TOO_LATE' };
  }

  const addedMinutes = Math.round((newEndAt.getTime() - currentEndAt.getTime()) / MINUTE_MS);
  const is5Min = input.allowTestStays === true && addedMinutes === 5;

  // newEndAt must align to the 15-minute grid (or be a 5-minute test extension)
  if (!isSlotAligned(newEndAt) && !is5Min) {
    return { ok: false, code: 'EXTENSION_NOT_SLOT_ALIGNED' };
  }

  // Total duration from booking start to newEndAt cannot exceed maximum (default 24h)
  const totalMinutes = Math.round((newEndAt.getTime() - startAt.getTime()) / MINUTE_MS);
  if (totalMinutes > maxDurationMinutes) {
    return { ok: false, code: 'EXTENSION_EXCEEDS_MAX_DURATION' };
  }

  return {
    ok: true,
    addedMinutes,
    totalMinutes,
  };
}

/**
 * Computes incremental pricing for a booking extension (doc 02 §4 Worked Example 5).
 *
 * Formula:
 * quote(whole new duration [startAt, newEndAt]) - currentPriceKobo(already paid for [startAt, currentEndAt]).
 * Service fee is 0 for extensions.
 */
export function calculateExtensionQuote(input: {
  ratePlan: RatePlanPrices;
  settings: ExtensionSettings;
  startAt: Date;
  currentEndAt: Date;
  newEndAt: Date;
  currentPriceKobo: Kobo;
}): ExtensionQuote {
  const { ratePlan, settings, startAt, currentEndAt, newEndAt, currentPriceKobo } = input;

  // Calculate the total quote for the entire stay from startAt to newEndAt
  const fullQuoteRes = quote({
    ratePlan,
    startAt,
    endAt: newEndAt,
    settings: {
      serviceFeeKobo: 0 as Kobo, // Extensions have zero service fee
      serviceFeeMaxDurationMin: 0,
      commissionBps: settings.commissionBps,
    },
  });

  if (!fullQuoteRes.ok) {
    throw new Error(`Failed to calculate quote for extension: ${fullQuoteRes.code}`);
  }

  // Incremental parking price = full stay price minus already paid price (never negative)
  const incrementalPriceKobo = Math.max(0, fullQuoteRes.quote.priceKobo - currentPriceKobo) as Kobo;

  const commissionKobo = mulDivRoundHalfUp(
    incrementalPriceKobo,
    settings.commissionBps,
    10_000,
  ) as Kobo;

  const operatorAmountKobo = (incrementalPriceKobo - commissionKobo) as Kobo;
  const addedMinutes = Math.round((newEndAt.getTime() - currentEndAt.getTime()) / MINUTE_MS);

  return {
    addedMinutes,
    priceKobo: incrementalPriceKobo,
    serviceFeeKobo: 0,
    totalKobo: incrementalPriceKobo,
    commissionKobo,
    operatorAmountKobo,
  };
}
