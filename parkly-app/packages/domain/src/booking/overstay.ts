import { assertKobo, mulDivRoundHalfUp, type Kobo } from '../money/money.js';
import type { RatePlanPrices } from '../pricing/quote.js';
import { ceil15Minutes, SLOT_MINUTES } from '../time/slots.js';

export type OverstayStatus = 'NONE' | 'DUE' | 'PAID' | 'UNPAID' | 'WAIVED';

export type OverstaySettings = {
  /** `session.overstay_grace_min`: minimum platform grace period (default 10). */
  defaultGraceMin: number;
  commissionBps: number;
};

export type OverstayRatePlan = RatePlanPrices & {
  overstayRateKobo?: number | null;
  overstayGraceMin?: number | null;
};

export type OverstayCalculation = {
  isOverstay: boolean;
  excessMinutes: number;
  overstayMinutes: number;
  blocks: number;
  per15Kobo: Kobo;
  amountKobo: Kobo;
  commissionKobo: Kobo;
  operatorAmountKobo: Kobo;
  status: OverstayStatus;
};

export type OverstayRatePlanValidation =
  { ok: true } | { ok: false; code: 'OVERSTAY_RATE_EXCEEDS_MAX' | 'OVERSTAY_GRACE_BELOW_MINIMUM' };

const MINUTE_MS = 60_000;

/**
 * Calculates overstay charges upon checkout (FR-BOOK-008, doc 02 §4 Worked Example 6, ADR 0016).
 *
 * Rules:
 * 1. Grace period: `max(platformGraceMin, lotGraceMin)`.
 * 2. If `checkOutAt <= endAt + graceMin`: zero charge, status NONE.
 * 3. If `checkOutAt > endAt + graceMin`:
 *    - excess = `checkOutAt - (endAt + graceMin)`.
 *    - overstayMinutes = `ceil15(excess)`.
 *    - blocks = `overstayMinutes / 15`.
 *    - per15Kobo = lot custom overstay rate or (hourly rate / 4).
 *    - amountKobo = blocks * per15Kobo.
 */
export function calculateOverstay(input: {
  endAt: Date;
  checkOutAt: Date;
  ratePlan: OverstayRatePlan;
  settings: OverstaySettings;
}): OverstayCalculation {
  const { endAt, checkOutAt, ratePlan, settings } = input;

  const graceMin = Math.max(
    settings.defaultGraceMin,
    ratePlan.overstayGraceMin ?? settings.defaultGraceMin,
  );

  const graceEndMs = endAt.getTime() + graceMin * MINUTE_MS;
  const checkOutMs = checkOutAt.getTime();

  // Determine base 15-minute block price
  let base15Kobo: number;
  if (ratePlan.overstayRateKobo && ratePlan.overstayRateKobo > 0) {
    base15Kobo = ratePlan.overstayRateKobo;
  } else if (ratePlan.hourlyRateKobo && ratePlan.hourlyRateKobo > 0) {
    base15Kobo = Math.round(ratePlan.hourlyRateKobo / 4);
  } else if (ratePlan.dailyRateKobo && ratePlan.dailyRateKobo > 0) {
    base15Kobo = Math.round(ratePlan.dailyRateKobo / 24 / 4);
  } else {
    base15Kobo = 0;
  }

  const per15Kobo = assertKobo(base15Kobo);

  // If checked out within the grace period: no overstay
  if (checkOutMs <= graceEndMs) {
    return {
      isOverstay: false,
      excessMinutes: 0,
      overstayMinutes: 0,
      blocks: 0,
      per15Kobo,
      amountKobo: 0 as Kobo,
      commissionKobo: 0 as Kobo,
      operatorAmountKobo: 0 as Kobo,
      status: 'NONE',
    };
  }

  // Excess time past the grace period
  const excessExactMinutes = (checkOutMs - graceEndMs) / MINUTE_MS;
  const excessMinutes = Math.ceil(excessExactMinutes);
  const overstayMinutes = ceil15Minutes(excessMinutes);
  const blocks = Math.max(1, Math.round(overstayMinutes / SLOT_MINUTES));

  const amountKobo = assertKobo(blocks * per15Kobo);
  const commissionKobo = mulDivRoundHalfUp(amountKobo, settings.commissionBps, 10_000) as Kobo;
  const operatorAmountKobo = (amountKobo - commissionKobo) as Kobo;

  return {
    isOverstay: true,
    excessMinutes,
    overstayMinutes,
    blocks,
    per15Kobo,
    amountKobo,
    commissionKobo,
    operatorAmountKobo,
    status: 'DUE',
  };
}

/**
 * Validates a rate plan's proposed overstay configuration (ADR 0016).
 *
 * Rules:
 * - Grace period must not be lower than platform minimum (10 min).
 * - Proposed overstay rate must not exceed `baseHourlyBlock * maxMultiplier` (default 2.0x).
 */
export function validateOverstayRatePlan(input: {
  hourlyRateKobo: number | null;
  overstayRateKobo?: number | null;
  maxMultiplier: number;
  minGraceMin: number;
  graceMin?: number | null;
}): OverstayRatePlanValidation {
  const { hourlyRateKobo, overstayRateKobo, maxMultiplier, minGraceMin, graceMin } = input;

  if (graceMin !== undefined && graceMin !== null && graceMin < minGraceMin) {
    return { ok: false, code: 'OVERSTAY_GRACE_BELOW_MINIMUM' };
  }

  if (overstayRateKobo && overstayRateKobo > 0 && hourlyRateKobo && hourlyRateKobo > 0) {
    const baseBlockKobo = hourlyRateKobo / 4;
    const maxAllowedKobo = Math.round(baseBlockKobo * maxMultiplier);
    if (overstayRateKobo > maxAllowedKobo) {
      return { ok: false, code: 'OVERSTAY_RATE_EXCEEDS_MAX' };
    }
  }

  return { ok: true };
}
