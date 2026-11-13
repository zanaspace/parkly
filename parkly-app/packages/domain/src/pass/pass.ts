export const PASS_STATUSES = ['HELD', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REVOKED'] as const;
export type PassStatus = (typeof PASS_STATUSES)[number];

export const PASS_DAYS = 30;
export const MAX_PASS_SWAPS_PER_MONTH = 2;
export const DEFAULT_PASS_MAX_SHARE_PERCENT = 50;

export interface PassPeriod {
  /** YYYY-MM-DD (inclusive start in Africa/Lagos) */
  periodStart: string;
  /** YYYY-MM-DD (inclusive end in Africa/Lagos, start + 29 days = 30-day window) */
  periodEnd: string;
  /** UTC ISO start at 00:00:00 Africa/Lagos (+01:00) */
  startsAt: string;
  /** UTC ISO end at 00:00:00 Africa/Lagos on the day after periodEnd */
  endsAt: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const LAGOS_OFFSET_MS = 60 * 60_000; // UTC+1 year-round (no DST)

/**
 * Computes the 30-day pass period for a given YYYY-MM-DD start date in Africa/Lagos.
 */
export function passPeriod(startDate: string): PassPeriod {
  if (!DATE_RE.test(startDate)) {
    throw new Error(`Invalid pass startDate "${startDate}": expected YYYY-MM-DD`);
  }
  const startUtcMidnightMs = Date.parse(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(startUtcMidnightMs)) {
    throw new Error(`Invalid pass startDate "${startDate}"`);
  }
  const endUtcMidnightMs = startUtcMidnightMs + (PASS_DAYS - 1) * DAY_MS;
  const periodEnd = new Date(endUtcMidnightMs).toISOString().slice(0, 10);

  // 00:00 Africa/Lagos = 23:00 previous day UTC (startUtcMidnightMs - 1h)
  const startsAtMs = startUtcMidnightMs - LAGOS_OFFSET_MS;
  const endsAtMs = startsAtMs + PASS_DAYS * DAY_MS;

  return {
    periodStart: startDate,
    periodEnd,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
  };
}

export interface PassCapacityInput {
  capacityBookable: number;
  maxSharePercent?: number;
  /** Number of overlapping HELD or ACTIVE passes in the 30-day window */
  overlappingPasses: number;
  /**
   * Maximum total committed bays (booked + held + passReserved + blocked)
   * across any 15-minute slot in the 30-day window BEFORE adding this pass.
   */
  maxSlotCommitted?: number;
}

export type PassCapacityResult =
  | { ok: true; maxPassesAllowed: number; remainingPassSlots: number }
  | {
      ok: false;
      reason: 'PASS_CAPACITY_UNAVAILABLE';
      maxPassesAllowed: number;
      remainingPassSlots: 0;
    };

/**
 * Checks whether a lot can accept another monthly pass during the target 30-day period.
 * Enforces both:
 * 1. Pass share cap (`floor(capacityBookable * maxSharePercent / 100)`, at least 1 when capacityBookable >= 1 and maxSharePercent > 0).
 * 2. Physical slot capacity across the 30-day window (`maxSlotCommitted + 1 <= capacityBookable`).
 */
export function checkPassCapacity(input: PassCapacityInput): PassCapacityResult {
  const sharePct = input.maxSharePercent ?? DEFAULT_PASS_MAX_SHARE_PERCENT;
  if (input.capacityBookable <= 0 || sharePct <= 0) {
    return {
      ok: false,
      reason: 'PASS_CAPACITY_UNAVAILABLE',
      maxPassesAllowed: 0,
      remainingPassSlots: 0,
    };
  }

  const rawShareCap = Math.floor((input.capacityBookable * sharePct) / 100);
  const maxPassesAllowed = Math.min(input.capacityBookable, Math.max(1, rawShareCap));

  const slotAvailable =
    input.maxSlotCommitted === undefined
      ? input.capacityBookable - input.overlappingPasses
      : input.capacityBookable - input.maxSlotCommitted;

  const remainingByShare = maxPassesAllowed - input.overlappingPasses;
  const remainingPassSlots = Math.max(0, Math.min(remainingByShare, slotAvailable));

  if (remainingPassSlots <= 0) {
    return {
      ok: false,
      reason: 'PASS_CAPACITY_UNAVAILABLE',
      maxPassesAllowed,
      remainingPassSlots: 0,
    };
  }

  return {
    ok: true,
    maxPassesAllowed,
    remainingPassSlots,
  };
}

export interface PassCheckInInput {
  status: PassStatus;
  periodStart: string;
  periodEnd: string;
  /** Current date in Africa/Lagos (YYYY-MM-DD) */
  todayLagos: string;
  /** True if this pass already has an OPEN parking session in the lot */
  hasOpenSession: boolean;
  /** True if the lot is currently open */
  isLotOpen?: boolean;
}

export type PassCheckInDecision =
  | { ok: true }
  | {
      ok: false;
      reason: 'PASS_NOT_ACTIVE' | 'OUTSIDE_WINDOW' | 'ALREADY_CHECKED_IN' | 'LOT_CLOSED';
    };

/**
 * Evaluates QR / attendant / self check-in rules for a monthly pass (`FR-PASS-002`):
 * - Pass must be ACTIVE
 * - Current Lagos date must fall within `[periodStart, periodEnd]` inclusive
 * - Only one vehicle on the pass may be checked into the lot at a time (`!hasOpenSession`)
 * - Lot must be open
 */
export function checkPassCheckIn(input: PassCheckInInput): PassCheckInDecision {
  if (input.isLotOpen === false) {
    return { ok: false, reason: 'LOT_CLOSED' };
  }
  if (input.status !== 'ACTIVE') {
    return { ok: false, reason: 'PASS_NOT_ACTIVE' };
  }
  if (input.todayLagos < input.periodStart || input.todayLagos > input.periodEnd) {
    return { ok: false, reason: 'OUTSIDE_WINDOW' };
  }
  if (input.hasOpenSession) {
    return { ok: false, reason: 'ALREADY_CHECKED_IN' };
  }
  return { ok: true };
}

export interface PassVehicleSwapInput {
  status: PassStatus;
  periodEnd: string;
  todayLagos: string;
  swapsUsed: number;
  maxSwaps?: number;
  /** Cannot swap vehicle while a vehicle on this pass is currently checked in (`OPEN` session) */
  hasOpenSession: boolean;
  currentVehicleId: string;
  newVehicleId: string;
}

export type PassVehicleSwapDecision =
  | { ok: true; swapsUsedAfter: number; swapsRemainingAfter: number }
  | {
      ok: false;
      reason:
        | 'PASS_NOT_ACTIVE'
        | 'PASS_SWAP_LIMIT_REACHED'
        | 'VEHICLE_IN_USE'
        | 'SAME_VEHICLE';
    };

/**
 * Evaluates whether a pass holder can swap the plate/vehicle attached to an active monthly pass (`FR-PASS-004`).
 * - Up to 2 swaps per 30-day pass period by default.
 * - Cannot swap while the pass currently has an OPEN parking session in the lot.
 */
export function checkPassVehicleSwap(input: PassVehicleSwapInput): PassVehicleSwapDecision {
  const maxSwaps = input.maxSwaps ?? MAX_PASS_SWAPS_PER_MONTH;
  if (input.status !== 'ACTIVE' || input.todayLagos > input.periodEnd) {
    return { ok: false, reason: 'PASS_NOT_ACTIVE' };
  }
  if (input.currentVehicleId === input.newVehicleId) {
    return { ok: false, reason: 'SAME_VEHICLE' };
  }
  if (input.hasOpenSession) {
    return { ok: false, reason: 'VEHICLE_IN_USE' };
  }
  if (input.swapsUsed >= maxSwaps) {
    return { ok: false, reason: 'PASS_SWAP_LIMIT_REACHED' };
  }
  const swapsUsedAfter = input.swapsUsed + 1;
  return {
    ok: true,
    swapsUsedAfter,
    swapsRemainingAfter: Math.max(0, maxSwaps - swapsUsedAfter),
  };
}

export interface PassRenewalReminderInput {
  status: PassStatus;
  periodEnd: string;
  todayLagos: string;
  /** Most recent reminder milestone already sent (e.g. 7 or 2), or null if none sent */
  lastReminderDays: number | null;
}

/**
 * Returns `7` or `2` when a pass renewal reminder (`FR-PASS-003`) should fire today in Africa/Lagos,
 * or `null` when no reminder is due.
 */
export function passRenewalReminderDue(input: PassRenewalReminderInput): 7 | 2 | null {
  if (input.status !== 'ACTIVE') return null;
  const endMs = Date.parse(`${input.periodEnd}T00:00:00.000Z`);
  const todayMs = Date.parse(`${input.todayLagos}T00:00:00.000Z`);
  if (!Number.isFinite(endMs) || !Number.isFinite(todayMs)) return null;

  const daysRemaining = Math.round((endMs - todayMs) / DAY_MS);
  if (daysRemaining === 7 && (input.lastReminderDays === null || input.lastReminderDays > 7)) {
    return 7;
  }
  if (daysRemaining === 2 && (input.lastReminderDays === null || input.lastReminderDays > 2)) {
    return 2;
  }
  return null;
}
