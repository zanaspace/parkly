import type { BookingStatus } from '../booking/booking.js';
import { normalisePlate } from '../plate/plate.js';

/**
 * Gate rules for the attendant app (doc 03 §3.3–3.8, doc 01 §5.3). Pure, so
 * the offline PWA and the API's sync use exactly the same decisions.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Events older than this are refused on sync (`attend.max_offline_hours`, doc 02 §8). */
export const MAX_EVENT_AGE_H = 48;
/** Larger device clock errors are corrected with the batch offset (doc 03 §3.8). */
export const MAX_CLOCK_SKEW_MIN = 10;

/** What the attendant app knows about one booking (from the manifest). */
export type GateBooking = {
  id: string;
  code: string;
  plateNorm: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  checkedInAt: Date | null;
};

export type GateRules = {
  /** `booking.early_arrival_min` */
  earlyArrivalMin: number;
  /** `booking.no_show_grace_min` */
  noShowGraceMin: number;
};

export type GateReason =
  'OK' | 'EARLY' | 'LATE' | 'ALREADY_IN' | 'PROVISIONAL' | 'CANCELLED' | 'ENDED' | 'NOT_FOUND';

export type GateDecision = {
  colour: 'GREEN' | 'AMBER' | 'RED';
  reason: GateReason;
  /** Amber results need a reason chip before the attendant lets the car in. */
  needsReason: boolean;
  bookingId: string | null;
  code: string | null;
  plate: string | null;
  checkedInAt: Date | null;
};

/** Claims from a QR whose signature, lot and expiry already checked out. */
export type GateQr = { b: string; c: string; p: string; s: Date; e: Date };

const RED = new Set<GateReason>(['CANCELLED', 'ENDED', 'NOT_FOUND']);
const DEAD = new Set<BookingStatus>(['CANCELLED', 'EXPIRED', 'PENDING_PAYMENT']);

function decision(
  reason: GateReason,
  who: { id: string; code: string; plate: string } | null,
  checkedInAt: Date | null = null,
): GateDecision {
  const colour = reason === 'OK' ? 'GREEN' : RED.has(reason) ? 'RED' : 'AMBER';
  return {
    colour,
    reason,
    needsReason: colour === 'AMBER',
    bookingId: who?.id ?? null,
    code: who?.code ?? null,
    plate: who?.plate ?? null,
    checkedInAt,
  };
}

/** Timing only: early, inside, late (after grace) or over. */
function timing(start: Date, end: Date, now: Date, rules: GateRules): GateReason {
  const t = now.getTime();
  if (t >= end.getTime()) return 'ENDED';
  if (t < start.getTime() - rules.earlyArrivalMin * MIN) return 'EARLY';
  if (t > start.getTime() + rules.noShowGraceMin * MIN) return 'LATE';
  return 'OK';
}

/**
 * Green / amber / red for a car at the gate (doc 03 §3.3). `booking` comes
 * from the manifest; `qr` is set when the ticket's signature was valid, so a
 * booking made after the last manifest refresh can still be let in.
 */
export function gateDecision(input: {
  booking: GateBooking | null;
  qr?: GateQr;
  /** This device already checked the booking in (event not yet synced). */
  localCheckedInAt?: Date | null;
  now: Date;
  rules: GateRules;
}): GateDecision {
  const { booking: b, qr, now, rules } = input;
  if (!b) {
    if (!qr) return decision('NOT_FOUND', null);
    const who = { id: qr.b, code: qr.c, plate: qr.p };
    const t = timing(qr.s, qr.e, now, rules);
    return decision(t === 'OK' ? 'PROVISIONAL' : t, who);
  }
  const who = { id: b.id, code: b.code, plate: b.plateNorm };
  if (DEAD.has(b.status)) return decision('CANCELLED', who);
  if (b.status === 'COMPLETED') return decision('ENDED', who);
  const inAt = input.localCheckedInAt ?? b.checkedInAt;
  if (inAt || b.status === 'CHECKED_IN') return decision('ALREADY_IN', who, inAt);
  const t = timing(b.startAt, b.endAt, now, rules);
  if (b.status === 'NO_SHOW' && t === 'OK') return decision('LATE', who);
  return decision(t, who);
}

/** One-edit (Levenshtein ≤ 1) comparison for typed plates. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Doc 03 §3.4: exact plate matches; if none, plates one typo away. */
export function findByPlate<T extends { plateNorm: string }>(
  list: readonly T[],
  typed: string,
): T[] {
  const plate = normalisePlate(typed);
  if (!plate) return [];
  const exact = list.filter((b) => b.plateNorm === plate);
  if (exact.length > 0) return exact;
  return list.filter((b) => withinOneEdit(b.plateNorm, plate));
}

/**
 * Doc 03 §3.8: the server stores the device time, but when the device clock
 * is more than 10 minutes off, every event in the batch is shifted by the
 * batch offset (server receive time − device send time) and flagged.
 */
export function correctClock(input: {
  occurredAt: Date;
  deviceSentAt: Date;
  serverReceivedAt: Date;
}): { occurredAt: Date; skewed: boolean } {
  const offset = input.serverReceivedAt.getTime() - input.deviceSentAt.getTime();
  if (Math.abs(offset) <= MAX_CLOCK_SKEW_MIN * MIN)
    return { occurredAt: input.occurredAt, skewed: false };
  return { occurredAt: new Date(input.occurredAt.getTime() + offset), skewed: true };
}

export type SessionTimes = { checkInAt: Date | null; checkOutAt: Date | null };

export type SyncRejection = { result: 'REJECTED'; reason: 'UNKNOWN_BOOKING' | 'TOO_OLD' };

const tooOld = (occurredAt: Date, received: Date) =>
  received.getTime() - occurredAt.getTime() > MAX_EVENT_AGE_H * HOUR;

/**
 * A synced CHECK_IN (doc 01 §5.3): the earliest check-in wins; later ones are
 * DUPLICATE. A car that entered on a booking cancelled while the device was
 * offline is still recorded (it is physically inside), flagged for ops.
 */
export function resolveCheckIn(input: {
  occurredAt: Date;
  /** Null when the booking is unknown to the server. */
  bookingStatus: BookingStatus | null;
  session: SessionTimes | null;
  received: Date;
}):
  | { result: 'APPLIED' | 'DUPLICATE' | 'CONFLICT'; checkInAt: Date; flags: string[] }
  | SyncRejection {
  if (input.bookingStatus === null) return { result: 'REJECTED', reason: 'UNKNOWN_BOOKING' };
  if (tooOld(input.occurredAt, input.received)) return { result: 'REJECTED', reason: 'TOO_OLD' };
  const current = input.session?.checkInAt ?? null;
  if (current && current.getTime() <= input.occurredAt.getTime())
    return { result: 'DUPLICATE', checkInAt: current, flags: [] };
  if (DEAD.has(input.bookingStatus))
    return { result: 'CONFLICT', checkInAt: input.occurredAt, flags: ['ENTRY_AFTER_CANCEL'] };
  return { result: 'APPLIED', checkInAt: input.occurredAt, flags: [] };
}

/**
 * A synced CHECK_OUT: the latest check-out wins. One with no check-in yet is
 * accepted and flagged (the check-in may still be on another device).
 */
export function resolveCheckOut(input: {
  occurredAt: Date;
  session: SessionTimes | null;
  received: Date;
}): { result: 'APPLIED' | 'DUPLICATE'; checkOutAt: Date; flags: string[] } | SyncRejection {
  if (tooOld(input.occurredAt, input.received)) return { result: 'REJECTED', reason: 'TOO_OLD' };
  const current = input.session?.checkOutAt ?? null;
  if (current && current.getTime() >= input.occurredAt.getTime())
    return { result: 'DUPLICATE', checkOutAt: current, flags: [] };
  const flags = input.session?.checkInAt ? [] : ['MISSING_CHECKIN'];
  return { result: 'APPLIED', checkOutAt: input.occurredAt, flags };
}

/** Walk-ins are only counted (doc 03 §3.5); the count never goes below zero. */
export function applyWalkIn(count: number, delta: 1 | -1): { count: number; clamped: boolean } {
  const next = count + delta;
  return next < 0 ? { count: 0, clamped: true } : { count: next, clamped: false };
}
