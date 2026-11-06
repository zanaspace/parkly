/** Bookings and inventory use 15-minute slots aligned to UTC (doc 00 §3.4). */
export const SLOT_MINUTES = 15;
const SLOT_MS = SLOT_MINUTES * 60_000;

/** Africa/Lagos is UTC+1 all year (no DST), so a fixed offset is exact. */
const LAGOS_OFFSET_MS = 60 * 60_000;

export function isSlotAligned(date: Date): boolean {
  return date.getTime() % SLOT_MS === 0;
}

export function floorToSlot(date: Date): Date {
  return new Date(Math.floor(date.getTime() / SLOT_MS) * SLOT_MS);
}

export function ceilToSlot(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / SLOT_MS) * SLOT_MS);
}

/** Slot start times covering [start, end). Both ends must be slot-aligned, or cover a 5-minute test stay. */
export function slotStartsBetween(start: Date, end: Date): Date[] {
  if (end.getTime() < start.getTime()) throw new RangeError('Window end is before start');
  const is5Min = end.getTime() - start.getTime() === 5 * 60_000;
  if (!isSlotAligned(start) || (!isSlotAligned(end) && !is5Min)) {
    throw new RangeError('Window must be aligned to 15-minute slots');
  }
  const slots: Date[] = [];
  const limit = is5Min ? ceilToSlot(end).getTime() : end.getTime();
  for (let t = start.getTime(); t < limit; t += SLOT_MS) slots.push(new Date(t));
  return slots;
}

/** Rounds a duration up to whole 15-minute blocks (overstay, extensions). */
export function ceil15Minutes(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

/** Calendar date in Africa/Lagos as YYYY-MM-DD (daily pricing, reports). */
export function lagosDateKey(date: Date): string {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight in Africa/Lagos at the start of `key` (YYYY-MM-DD), as a UTC instant. */
export function lagosDayStart(key: string): Date {
  const d = new Date(`${key}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 10) !== key
  )
    throw new RangeError(`Not a YYYY-MM-DD date: ${key}`);
  return new Date(d.getTime() - LAGOS_OFFSET_MS);
}
