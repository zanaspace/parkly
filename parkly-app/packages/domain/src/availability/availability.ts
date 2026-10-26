import type { OpeningDay } from '../lot/draft.js';
import { ceilToSlot, isSlotAligned, lagosDateKey, SLOT_MINUTES } from '../time/slots.js';

/**
 * Pure availability maths (doc 02 §5). The locking itself lives in the SQL
 * function `fn_hold_booking` (S4); this answers "how many spaces are free?"
 * and "may this window be searched or booked?".
 */

export type SlotCounts = {
  slotStart: Date;
  capacity: number;
  booked: number;
  held: number;
  passReserved: number;
  blocked: number;
};

/**
 * Spaces free for the whole window: the minimum over its slots. A slot with no
 * inventory row yet offers the lot's bookable capacity (rows are created on demand).
 */
export function availableInWindow(input: {
  slots: readonly Date[];
  rows: readonly SlotCounts[];
  capacityBookable: number;
}): number {
  if (input.slots.length === 0) return 0;
  const byStart = new Map(input.rows.map((r) => [r.slotStart.getTime(), r]));
  let min = Infinity;
  for (const slot of input.slots) {
    const r = byStart.get(slot.getTime());
    const free = r
      ? r.capacity - r.booked - r.held - r.passReserved - r.blocked
      : input.capacityBookable;
    min = Math.min(min, free);
  }
  return Math.max(0, min);
}

/** `booking.min_lead_min`, `booking.max_advance_days`, `booking.max_duration_hours` (doc 02 §8). */
export type BookingWindowLimits = {
  minLeadMin: number;
  maxAdvanceDays: number;
  maxDurationHours: number;
};

const MINUTE_MS = 60_000;

/**
 * Doc 02 §5 booking window limits: on the 15-minute grid, starting no earlier
 * than now + lead (rounded up to the next slot), at most 30 days ahead, and an
 * hourly stay at most 24 hours.
 */
export function checkSearchWindow(input: {
  startAt: Date;
  endAt: Date;
  now: Date;
  limits: BookingWindowLimits;
  product: 'HOURLY' | 'DAILY';
}): 'SEARCH_INVALID_WINDOW' | null {
  const { startAt, endAt, now, limits } = input;
  const start = startAt.getTime();
  const end = endAt.getTime();
  const is5Min = end - start === 5 * MINUTE_MS;
  if (!is5Min) {
    if (!isSlotAligned(startAt) || !isSlotAligned(endAt) || end <= start)
      return 'SEARCH_INVALID_WINDOW';
    const earliest = ceilToSlot(new Date(now.getTime() + limits.minLeadMin * MINUTE_MS));
    // The slot in progress cannot be booked: round "now" up even when it sits on the grid.
    const firstFree = Math.max(earliest.getTime(), ceilToSlot(new Date(now.getTime() + 1)).getTime());
    if (start < firstFree) return 'SEARCH_INVALID_WINDOW';
    if (start > now.getTime() + limits.maxAdvanceDays * 24 * 60 * MINUTE_MS)
      return 'SEARCH_INVALID_WINDOW';
    if (input.product === 'HOURLY' && end - start > limits.maxDurationHours * 60 * MINUTE_MS)
      return 'SEARCH_INVALID_WINDOW';
  } else {
    if (end <= start) return 'SEARCH_INVALID_WINDOW';
    if (start < now.getTime() - 2 * MINUTE_MS) return 'SEARCH_INVALID_WINDOW';
  }
  return null;
}

const LAGOS_OFFSET_MS = 60 * MINUTE_MS;
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Is the 15-minute slot starting at `slot` inside the opening hours? */
function slotOpen(byDay: Map<number, OpeningDay>, slot: Date): boolean {
  const local = new Date(slot.getTime() + LAGOS_OFFSET_MS);
  const weekday = local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const end = minute + SLOT_MINUTES;

  const today = byDay.get(weekday);
  if (today?.is24h) return true;
  if (today && !today.is24h && today.opensAt && today.closesAt) {
    const opens = minutesOf(today.opensAt);
    const closes = minutesOf(today.closesAt);
    if (closes > opens ? minute >= opens && end <= closes : minute >= opens) return true;
  }
  // An overnight window from the day before runs on until its closing time.
  const yesterday = byDay.get((weekday + 6) % 7);
  if (yesterday && !yesterday.is24h && yesterday.opensAt && yesterday.closesAt) {
    const opens = minutesOf(yesterday.opensAt);
    const closes = minutesOf(yesterday.closesAt);
    if (closes < opens && end <= closes) return true;
  }
  return false;
}

/**
 * Whether the lot is open for the whole window. A DAILY stay needs hours on
 * every Lagos day it touches (the day pass covers that day's hours).
 */
export function isOpenDuring(input: {
  hours: readonly OpeningDay[];
  startAt: Date;
  endAt: Date;
  product: 'HOURLY' | 'DAILY';
}): boolean {
  const byDay = new Map(input.hours.map((d) => [d.weekday, d]));
  const start = input.startAt.getTime();
  const end = input.endAt.getTime();
  if (end <= start) return false;
  if (input.product === 'DAILY') {
    const last = lagosDateKey(new Date(end - 1));
    for (let t = start; lagosDateKey(new Date(t)) <= last; t += 24 * 60 * MINUTE_MS) {
      const weekday = new Date(Date.parse(`${lagosDateKey(new Date(t))}T00:00:00Z`)).getUTCDay();
      if (!byDay.has(weekday)) return false;
    }
    return true;
  }
  for (let t = start; t < end; t += SLOT_MINUTES * MINUTE_MS)
    if (!slotOpen(byDay, new Date(t))) return false;
  return true;
}

/** How far a stay may be extended (FR-BOOK-005) given the car park's opening hours. */
export type ExtensionWindow = {
  /** The latest new end time allowed, or null when the stay cannot be extended at all. */
  extendableUntil: Date | null;
  /** When the car park closes after the current end, if that comes before `maxEndAt`. */
  closesAt: Date | null;
  /** When it opens again after `closesAt` (looking up to a week ahead), else null. */
  reopensAt: Date | null;
};

const REOPEN_HORIZON_MS = 7 * 24 * 60 * MINUTE_MS;

/**
 * Walks forward from the current end on the 15-minute grid and stops at the
 * first slot the car park is closed, or at `maxEndAt` (the longest stay
 * allowed). Uses `isOpenDuring`, so it always agrees with the API's check.
 */
export function extensionWindow(input: {
  hours: readonly OpeningDay[];
  currentEndAt: Date;
  maxEndAt: Date;
  product: 'HOURLY' | 'DAILY';
}): ExtensionWindow {
  const step = SLOT_MINUTES * MINUTE_MS;
  const from = input.currentEndAt.getTime();
  const cap = input.maxEndAt.getTime();
  let lastOk: number | null = null;
  let closesAt: number | null = null;
  for (let t = from + step; t <= cap; t += step) {
    const open = isOpenDuring({
      hours: input.hours,
      startAt: input.currentEndAt,
      endAt: new Date(t),
      product: input.product,
    });
    if (!open) {
      closesAt = t - step;
      break;
    }
    lastOk = t;
  }

  let reopensAt: number | null = null;
  if (closesAt !== null) {
    for (let t = closesAt + step; t <= closesAt + REOPEN_HORIZON_MS; t += step) {
      const open = isOpenDuring({
        hours: input.hours,
        startAt: new Date(t),
        endAt: new Date(t + step),
        product: 'HOURLY',
      });
      if (open) {
        reopensAt = t;
        break;
      }
    }
  }

  return {
    extendableUntil: lastOk === null ? null : new Date(lastOk),
    closesAt: closesAt === null ? null : new Date(closesAt),
    reopensAt: reopensAt === null ? null : new Date(reopensAt),
  };
}
