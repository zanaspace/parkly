import { assertKobo, mulDivRoundHalfUp, type Kobo } from '../money/money.js';
import { ceil15Minutes, SLOT_MINUTES } from '../time/slots.js';

export const DEFAULT_FREE_HOLD_MINUTES = 60;
export const DEFAULT_MAX_HOLD_MINUTES = 180;
export const DEFAULT_HOLD_CAP_PERCENT = 30;
export const DEFAULT_HOLDING_FEE_FLOOR_KOBO = 15_000 as Kobo; // ₦150 floor per 15-minute block

export type HoldingFeeCalculation = {
  isFeeAccrued: boolean;
  heldMinutes: number;
  freeHoldMinutes: number;
  excessMinutes: number;
  billableMinutes: number;
  blocks: number;
  per15Kobo: Kobo;
  holdingFeeKobo: Kobo;
  commissionKobo: Kobo;
  operatorAmountKobo: Kobo;
};

export type HoldingFeeInput = {
  holdStartedAt: Date;
  checkedInAt: Date;
  hourlyRateKobo: number;
  commissionBps: number;
  freeHoldMinutes?: number;
  maxHoldMinutes?: number;
  floorKoboPer15Min?: number;
};

/**
 * Calculates accrued holding fees when a "Park now" driver checks in (ADR 0024).
 *
 * Rules:
 * 1. The first `freeHoldMinutes` (default 60 min) are free.
 * 2. Beyond `freeHoldMinutes`, holding fee is 25% of hourly rate per started 15 minutes.
 * 3. A floor of ₦150 (15,000 kobo) per 15-minute block applies.
 * 4. Held duration is capped at `maxHoldMinutes` (default 180 min).
 */
export function calculateHoldingFee(input: HoldingFeeInput): HoldingFeeCalculation {
  const freeHoldMinutes = input.freeHoldMinutes ?? DEFAULT_FREE_HOLD_MINUTES;
  const maxHoldMinutes = input.maxHoldMinutes ?? DEFAULT_MAX_HOLD_MINUTES;
  const floorKobo = (input.floorKoboPer15Min ?? DEFAULT_HOLDING_FEE_FLOOR_KOBO) as Kobo;

  const rawHeldMinutes = (input.checkedInAt.getTime() - input.holdStartedAt.getTime()) / 60_000;
  const heldMinutes = Math.max(0, Math.ceil(rawHeldMinutes));

  // Determine base 15-minute block fee: 25% of hourly rate with floor
  const rateQuarter = Math.round(input.hourlyRateKobo / 4);
  const per15Kobo = assertKobo(Math.max(floorKobo, rateQuarter));

  if (heldMinutes <= freeHoldMinutes) {
    return {
      isFeeAccrued: false,
      heldMinutes,
      freeHoldMinutes,
      excessMinutes: 0,
      billableMinutes: 0,
      blocks: 0,
      per15Kobo,
      holdingFeeKobo: 0 as Kobo,
      commissionKobo: 0 as Kobo,
      operatorAmountKobo: 0 as Kobo,
    };
  }

  const cappedHeldMinutes = Math.min(heldMinutes, maxHoldMinutes);
  const excessMinutes = cappedHeldMinutes - freeHoldMinutes;
  const billableMinutes = ceil15Minutes(excessMinutes);
  const blocks = Math.max(1, Math.round(billableMinutes / SLOT_MINUTES));

  const holdingFeeKobo = assertKobo(blocks * per15Kobo);
  const commissionKobo = mulDivRoundHalfUp(holdingFeeKobo, input.commissionBps, 10_000) as Kobo;
  const operatorAmountKobo = assertKobo(holdingFeeKobo - commissionKobo);

  return {
    isFeeAccrued: true,
    heldMinutes,
    freeHoldMinutes,
    excessMinutes,
    billableMinutes,
    blocks,
    per15Kobo,
    holdingFeeKobo,
    commissionKobo,
    operatorAmountKobo,
  };
}

/**
 * Returns the exact timestamp when a confirmed "Park now" hold expires if check-in has not occurred.
 */
export function calculateHoldExpiration(
  holdStartedAt: Date,
  maxHoldMinutes: number = DEFAULT_MAX_HOLD_MINUTES,
): Date {
  return new Date(holdStartedAt.getTime() + maxHoldMinutes * 60_000);
}

/**
 * Checks whether the flexible hold deadline has passed.
 */
export function isFlexibleHoldExpired(
  holdStartedAt: Date,
  now: Date,
  maxHoldMinutes: number = DEFAULT_MAX_HOLD_MINUTES,
): boolean {
  return now.getTime() >= calculateHoldExpiration(holdStartedAt, maxHoldMinutes).getTime();
}

/**
 * Checks if a lot has capacity for an additional "Park now" hold.
 *
 * Each lot configures what percentage of its bookable capacity may be held (default 30%).
 * If `holdCapPercent` is 0, flexible holds are disabled.
 */
export function checkHoldCapacity(params: {
  activeHoldsCount: number;
  capacityBookable: number;
  holdCapPercent?: number;
}): {
  allowed: boolean;
  maxHolds: number;
  activeHoldsCount: number;
} {
  const percent = params.holdCapPercent ?? DEFAULT_HOLD_CAP_PERCENT;
  if (percent <= 0 || params.capacityBookable <= 0) {
    return {
      allowed: false,
      maxHolds: 0,
      activeHoldsCount: params.activeHoldsCount,
    };
  }

  const raw = Math.floor((params.capacityBookable * percent) / 100);
  const maxHolds = Math.max(1, raw);
  const allowed = params.activeHoldsCount < maxHolds;

  return {
    allowed,
    maxHolds,
    activeHoldsCount: params.activeHoldsCount,
  };
}

/**
 * The hourly rate a "Park now" hold is charged against (ADR 0024): the
 * booking's own rate plan, else what the booking cost per hour booked. Never
 * the booking's total price, which made a 3-hour hold fee three times too big.
 */
export function holdHourlyRateKobo(input: {
  planHourlyKobo: number | null | undefined;
  priceKobo: number;
  startAt: Date;
  endAt: Date;
}): Kobo {
  if (input.planHourlyKobo && input.planHourlyKobo > 0) return assertKobo(input.planHourlyKobo);
  const minutes = Math.round((input.endAt.getTime() - input.startAt.getTime()) / 60_000);
  if (minutes <= 0) return assertKobo(input.priceKobo);
  return mulDivRoundHalfUp(assertKobo(input.priceKobo), 60, minutes) as Kobo;
}
