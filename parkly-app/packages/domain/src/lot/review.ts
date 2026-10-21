import { SLOT_MINUTES, lagosDateKey } from '../time/slots.js';
import type { PermitStatus } from './lot.js';

/**
 * Rules for the things ops reviews before a lot goes LIVE: permits,
 * verification checklists and rate plans (doc 02 §2.4–2.5, §3.4).
 */

/** KYB, permits, verifications and rate plans are decided from SUBMITTED or IN_REVIEW only. */
export function canReview(status: PermitStatus): boolean {
  return status === 'SUBMITTED' || status === 'IN_REVIEW';
}

// --- dates ----------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds calendar months to `YYYY-MM-DD`, clamping to the month's last day (Jan 31 + 1 → Feb 28). */
export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// --- verification -----------------------------------------------------------------

export const VERIFICATION_ITEMS = [
  'LASPA_PERMIT',
  'GUARD_PRESENCE',
  'LIGHTING',
  'CCTV',
  'ACCESS_CONTROL',
  'CAPACITY_COUNT',
  'OWNER_IDENTITY',
  'ENTRANCE_SIGNAGE',
  'FIRE_SAFETY',
] as const;
export type VerificationItem = (typeof VERIFICATION_ITEMS)[number];

export const REQUIRED_VERIFICATION_ITEMS = [
  'LASPA_PERMIT',
  'GUARD_PRESENCE',
  'LIGHTING',
  'CAPACITY_COUNT',
  'OWNER_IDENTITY',
] as const satisfies readonly VerificationItem[];

export type ChecklistItem = { item: VerificationItem; result: 'PASS' | 'FAIL' | 'NA' };

/** A verification can be APPROVED only when every required item passed. */
export function evaluateChecklist(items: readonly ChecklistItem[]): {
  passed: boolean;
  failed: VerificationItem[];
  missing: VerificationItem[];
} {
  const results = new Map(items.map((i) => [i.item, i.result]));
  const failed: VerificationItem[] = [];
  const missing: VerificationItem[] = [];
  for (const item of REQUIRED_VERIFICATION_ITEMS) {
    const result = results.get(item);
    if (result === undefined) missing.push(item);
    else if (result !== 'PASS') failed.push(item);
  }
  return { passed: failed.length === 0 && missing.length === 0, failed, missing };
}

/** A verification counts for 12 months from the inspection day (doc 00 §3.6). */
export function verificationValidUntil(inspectedAt: Date): string {
  return addMonthsToDate(lagosDateKey(inspectedAt), 12);
}

// --- permits ------------------------------------------------------------------------

/** Validates the dates an operator enters for a LASPA permit. */
export function checkPermitDates(input: {
  issuedOn: string;
  expiresOn: string;
  now: Date;
}): 'PERMIT_DATES_INVALID' | 'PERMIT_EXPIRED' | null {
  const today = lagosDateKey(input.now);
  if (input.expiresOn <= input.issuedOn || input.issuedOn > today) return 'PERMIT_DATES_INVALID';
  if (input.expiresOn <= today) return 'PERMIT_EXPIRED';
  return null;
}

export const PERMIT_REMINDER_DAYS = [30, 14, 7, 1] as const;

export type PermitExpiryAction =
  | { kind: 'none' }
  | { kind: 'remind'; days: (typeof PERMIT_REMINDER_DAYS)[number] }
  | { kind: 'expire' };

/**
 * What the daily permit job does for one APPROVED permit (FR-LOT-007).
 * Sends the nearest reminder not yet sent, so a missed run never sends a burst.
 */
export function permitExpiryAction(input: {
  expiresOn: string;
  lastReminderDays: number | null;
  now: Date;
}): PermitExpiryAction {
  const daysLeft = daysBetween(lagosDateKey(input.now), input.expiresOn);
  if (daysLeft <= 0) return { kind: 'expire' };
  const due = [...PERMIT_REMINDER_DAYS].reverse().find((t) => daysLeft <= t);
  if (due === undefined) return { kind: 'none' };
  if (input.lastReminderDays !== null && input.lastReminderDays <= due) return { kind: 'none' };
  return { kind: 'remind', days: due };
}

// --- rate plans -----------------------------------------------------------------------

export type RatePlanProduct = 'HOURLY' | 'DAILY' | 'MONTHLY';

export type RatePlanInput = {
  product: RatePlanProduct;
  hourlyRateKobo?: number | null;
  minMinutes?: number | null;
  dailyCapKobo?: number | null;
  dailyRateKobo?: number | null;
  monthlyRateKobo?: number | null;
};

export type RatePlanError = { field: keyof RatePlanInput; message: string };

const isPositiveKobo = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** Field-level checks for an operator's rate plan; an empty list means valid. */
export function validateRatePlan(plan: RatePlanInput): RatePlanError[] {
  const errors: RatePlanError[] = [];
  switch (plan.product) {
    case 'HOURLY': {
      if (!isPositiveKobo(plan.hourlyRateKobo))
        errors.push({ field: 'hourlyRateKobo', message: 'Enter a price per hour.' });
      const min = plan.minMinutes ?? 60;
      if (!Number.isInteger(min) || min < SLOT_MINUTES || min > 24 * 60 || min % SLOT_MINUTES)
        errors.push({
          field: 'minMinutes',
          message: 'The minimum stay must be 15 minutes to 24 hours, in 15-minute steps.',
        });
      if (plan.dailyCapKobo !== null && plan.dailyCapKobo !== undefined) {
        const hourly = isPositiveKobo(plan.hourlyRateKobo) ? plan.hourlyRateKobo : 0;
        if (!isPositiveKobo(plan.dailyCapKobo) || plan.dailyCapKobo < hourly)
          errors.push({
            field: 'dailyCapKobo',
            message: 'The daily cap must be at least one hour’s price.',
          });
      }
      break;
    }
    case 'DAILY':
      if (!isPositiveKobo(plan.dailyRateKobo))
        errors.push({ field: 'dailyRateKobo', message: 'Enter a price per day.' });
      break;
    case 'MONTHLY':
      if (!isPositiveKobo(plan.monthlyRateKobo))
        errors.push({ field: 'monthlyRateKobo', message: 'Enter a price per month.' });
      break;
  }
  return errors;
}
