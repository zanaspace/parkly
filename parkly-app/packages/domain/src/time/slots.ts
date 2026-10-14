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

/** Slot start times covering [start, end). Both ends must be slot-aligned. */
export function slotStartsBetween(start: Date, end: Date): Date[] {
  if (!isSlotAligned(start) || !isSlotAligned(end)) {
    throw new RangeError('Window must be aligned to 15-minute slots');
  }
  if (end.getTime() < start.getTime()) throw new RangeError('Window end is before start');
  const slots: Date[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MS) slots.push(new Date(t));
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
