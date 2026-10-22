/**
 * Booking lifecycle (doc 00 §3.6, doc 02 §3.1). Only a verified payment moves a
 * booking to CONFIRMED, and only the SYSTEM actor (webhook or server verify)
 * may do it: never the client's word (AGENTS.md §7.7).
 */

export const BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type BookingActor = 'DRIVER' | 'ADMIN' | 'ATTENDANT' | 'SYSTEM';

const MINUTE_MS = 60_000;

/** `booking.hold_minutes` after `now`: when an unpaid hold releases its space. */
export function holdExpiresAt(now: Date, holdMinutes: number): Date {
  if (!Number.isSafeInteger(holdMinutes) || holdMinutes <= 0) {
    throw new RangeError(`Invalid hold minutes: ${holdMinutes}`);
  }
  return new Date(now.getTime() + holdMinutes * MINUTE_MS);
}

/** A hold is still good at its expiry instant and gone just after. */
export function isHoldExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime();
}

export type BookingFacts = {
  startAt: Date;
  endAt: Date;
  holdExpiresAt: Date | null;
  /** Server verify said success (confirmation only). */
  paymentSucceeded: boolean;
  /** Verified amount and currency equal the payment row (confirmation only). */
  amountMatches: boolean;
  /** The scanned or chosen lot is the booking's lot (check-in only). */
  lotMatches: boolean;
  /** A space was taken again for the rest of the window (late arrival only). */
  capacityReacquired: boolean;
  /** The provider declined the charge, or checkout could not start: the hold ends now. */
  paymentFailed?: boolean;
};

export type BookingSettings = {
  /** `booking.no_show_grace_min` */
  noShowGraceMin: number;
  /** `booking.early_arrival_min` */
  earlyArrivalMin: number;
};

export type BookingTransitionError =
  | 'INVALID_STATE_TRANSITION'
  | 'FORBIDDEN'
  | 'PAYMENT_NOT_SUCCEEDED'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'HOLD_NOT_EXPIRED'
  | 'TOO_EARLY_TO_CHECK_IN'
  | 'QR_WRONG_LOT'
  | 'NO_SHOW_GRACE_NOT_OVER'
  | 'BOOKING_WINDOW_OVER'
  | 'BOOKING_SLOT_UNAVAILABLE';

export type BookingTransitionResult = { ok: true } | { ok: false; code: BookingTransitionError };

type GuardInput = { now: Date; facts: BookingFacts; settings: BookingSettings };
type Guard = (input: GuardInput) => BookingTransitionError | null;

type Rule = { actors: readonly BookingActor[]; guard?: Guard };

const confirmed: Guard = ({ facts }) => {
  if (!facts.paymentSucceeded) return 'PAYMENT_NOT_SUCCEEDED';
  if (!facts.amountMatches) return 'PAYMENT_AMOUNT_MISMATCH';
  return null;
};

const holdRunOut: Guard = ({ now, facts }) =>
  facts.paymentFailed || (facts.holdExpiresAt && isHoldExpired(facts.holdExpiresAt, now))
    ? null
    : 'HOLD_NOT_EXPIRED';

const checkInWindow: Guard = ({ now, facts, settings }) => {
  if (!facts.lotMatches) return 'QR_WRONG_LOT';
  const opens = facts.startAt.getTime() - settings.earlyArrivalMin * MINUTE_MS;
  return now.getTime() < opens ? 'TOO_EARLY_TO_CHECK_IN' : null;
};

const graceOver: Guard = ({ now, facts, settings }) =>
  now.getTime() > facts.startAt.getTime() + settings.noShowGraceMin * MINUTE_MS
    ? null
    : 'NO_SHOW_GRACE_NOT_OVER';

const lateArrival: Guard = (input) => {
  const { now, facts } = input;
  if (!facts.lotMatches) return 'QR_WRONG_LOT';
  if (now.getTime() >= facts.endAt.getTime()) return 'BOOKING_WINDOW_OVER';
  return facts.capacityReacquired ? null : 'BOOKING_SLOT_UNAVAILABLE';
};

const TRANSITIONS: Partial<Record<BookingStatus, Partial<Record<BookingStatus, Rule>>>> = {
  PENDING_PAYMENT: {
    CONFIRMED: { actors: ['SYSTEM'], guard: confirmed },
    EXPIRED: { actors: ['SYSTEM'], guard: holdRunOut },
    CANCELLED: { actors: ['DRIVER'] },
  },
  CONFIRMED: {
    CHECKED_IN: { actors: ['ATTENDANT', 'SYSTEM'], guard: checkInWindow },
    CANCELLED: { actors: ['DRIVER', 'ADMIN'] },
    NO_SHOW: { actors: ['SYSTEM'], guard: graceOver },
  },
  NO_SHOW: {
    CHECKED_IN: { actors: ['ATTENDANT', 'ADMIN'], guard: lateArrival },
  },
  CHECKED_IN: {
    COMPLETED: { actors: ['ATTENDANT', 'SYSTEM'] },
  },
};

/** Checks one status change against the transition table and its guard. */
export function checkBookingTransition(input: {
  from: BookingStatus;
  to: BookingStatus;
  actor: BookingActor;
  now: Date;
  facts: BookingFacts;
  settings: BookingSettings;
}): BookingTransitionResult {
  const rule = TRANSITIONS[input.from]?.[input.to];
  if (!rule) return { ok: false, code: 'INVALID_STATE_TRANSITION' };
  if (!rule.actors.includes(input.actor)) return { ok: false, code: 'FORBIDDEN' };
  const problem = rule.guard?.(input) ?? null;
  return problem ? { ok: false, code: problem } : { ok: true };
}
