import { describe, expect, it } from 'vitest';
import {
  availableInWindow,
  checkSearchWindow,
  extensionWindow,
  isOpenDuring,
  type BookingWindowLimits,
} from './availability.js';
import type { OpeningDay } from '../lot/draft.js';

const lagos = (local: string) => new Date(`${local.replace(' ', 'T')}:00+01:00`);

describe('availableInWindow (doc 02 §5)', () => {
  const slots = [lagos('2026-10-20 08:00'), lagos('2026-10-20 08:15'), lagos('2026-10-20 08:30')];
  const row = (
    slot: Date,
    used: Partial<Record<'booked' | 'held' | 'passReserved' | 'blocked', number>>,
  ) => ({
    slotStart: slot,
    capacity: 10,
    booked: 0,
    held: 0,
    passReserved: 0,
    blocked: 0,
    ...used,
  });

  it('is the bookable capacity when no slot has inventory yet', () => {
    expect(availableInWindow({ slots, rows: [], capacityBookable: 12 })).toBe(12);
  });

  it('is the minimum over the window, counting booked, held, pass and blocked spaces', () => {
    const rows = [
      row(slots[0] as Date, { booked: 2 }),
      row(slots[1] as Date, { booked: 3, held: 1, passReserved: 2, blocked: 1 }),
    ];
    // Slot 3 has no row yet, so it offers the full 10 bookable spaces.
    expect(availableInWindow({ slots, rows, capacityBookable: 10 })).toBe(3);
  });

  it('never goes below zero, and ignores rows outside the window', () => {
    const rows = [
      row(slots[0] as Date, { booked: 12 }),
      row(lagos('2026-10-20 09:00'), { booked: 10 }),
    ];
    expect(availableInWindow({ slots, rows, capacityBookable: 10 })).toBe(0);
    expect(availableInWindow({ slots: slots.slice(1), rows, capacityBookable: 10 })).toBe(10);
  });

  it('is zero for an empty window', () => {
    expect(availableInWindow({ slots: [], rows: [], capacityBookable: 10 })).toBe(0);
  });
});

describe('checkSearchWindow (doc 02 §5 booking window limits)', () => {
  const limits: BookingWindowLimits = { minLeadMin: 0, maxAdvanceDays: 30, maxDurationHours: 24 };
  const now = lagos('2026-10-20 08:07');
  const check = (start: string, end: string, product: 'HOURLY' | 'DAILY' = 'HOURLY') =>
    checkSearchWindow({ startAt: lagos(start), endAt: lagos(end), now, limits, product });

  it('accepts a window on the grid from the next slot onward', () => {
    expect(check('2026-10-20 08:15', '2026-10-20 10:00')).toBeNull();
    expect(check('2026-11-19 08:00', '2026-11-19 10:00')).toBeNull();
  });

  it('refuses the past, the current slot, off-grid times and backwards windows', () => {
    expect(check('2026-10-20 08:00', '2026-10-20 10:00')).toBe('SEARCH_INVALID_WINDOW');
    expect(check('2026-10-20 08:20', '2026-10-20 10:00')).toBe('SEARCH_INVALID_WINDOW');
    expect(check('2026-10-20 10:00', '2026-10-20 10:00')).toBe('SEARCH_INVALID_WINDOW');
    expect(check('2026-10-20 10:00', '2026-10-20 09:00')).toBe('SEARCH_INVALID_WINDOW');
  });

  it('refuses more than 30 days ahead and hourly stays over 24 hours', () => {
    expect(check('2026-11-19 08:15', '2026-11-19 10:00')).toBe('SEARCH_INVALID_WINDOW');
    expect(check('2026-10-21 08:00', '2026-10-22 08:15')).toBe('SEARCH_INVALID_WINDOW');
    expect(check('2026-10-21 00:00', '2026-10-23 00:00', 'DAILY')).toBeNull();
  });

  it('accepts a 5-minute stay only when test stays are switched on', () => {
    const input = {
      startAt: lagos('2026-10-20 08:15'),
      endAt: lagos('2026-10-20 08:20'),
      now,
      limits,
      product: 'HOURLY' as const,
    };
    expect(checkSearchWindow(input)).toBe('SEARCH_INVALID_WINDOW');
    expect(checkSearchWindow({ ...input, allowTestStays: true })).toBeNull();
  });

  it('honours a minimum lead time', () => {
    const r = checkSearchWindow({
      startAt: lagos('2026-10-20 08:15'),
      endAt: lagos('2026-10-20 10:00'),
      now,
      limits: { ...limits, minLeadMin: 30 },
      product: 'HOURLY',
    });
    expect(r).toBe('SEARCH_INVALID_WINDOW');
  });
});

describe('isOpenDuring (doc 03 §1.2: "Closed at that time")', () => {
  // Monday 2026-10-19, Tuesday 2026-10-20 (Lagos).
  const weekdays: OpeningDay[] = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    is24h: false,
    opensAt: '07:00',
    closesAt: '19:00',
  }));
  const open = (
    hours: OpeningDay[],
    start: string,
    end: string,
    product: 'HOURLY' | 'DAILY' = 'HOURLY',
  ) => isOpenDuring({ hours, startAt: lagos(start), endAt: lagos(end), product });

  it('is open inside the day’s window, up to and including closing time', () => {
    expect(open(weekdays, '2026-10-20 07:00', '2026-10-20 19:00')).toBe(true);
    expect(open(weekdays, '2026-10-20 06:45', '2026-10-20 08:00')).toBe(false);
    expect(open(weekdays, '2026-10-20 18:00', '2026-10-20 19:15')).toBe(false);
  });

  it('is closed on days without hours', () => {
    expect(open(weekdays, '2026-10-18 10:00', '2026-10-18 11:00')).toBe(false); // Sunday
    expect(open([], '2026-10-20 10:00', '2026-10-20 11:00')).toBe(false);
  });

  it('handles 24-hour days and overnight windows', () => {
    const allDay: OpeningDay[] = [
      { weekday: 2, is24h: true },
      { weekday: 3, is24h: true },
    ];
    expect(open(allDay, '2026-10-20 22:00', '2026-10-21 06:00')).toBe(true);
    const night: OpeningDay[] = [{ weekday: 2, is24h: false, opensAt: '18:00', closesAt: '02:00' }];
    expect(open(night, '2026-10-20 22:00', '2026-10-21 02:00')).toBe(true); // Tue night into Wed
    expect(open(night, '2026-10-21 01:00', '2026-10-21 02:15')).toBe(false);
    expect(open(night, '2026-10-20 17:45', '2026-10-20 19:00')).toBe(false);
  });

  it('uses Lagos time, not UTC', () => {
    // 07:00 Lagos is 06:00 UTC: open in Lagos.
    expect(
      isOpenDuring({
        hours: weekdays,
        startAt: new Date('2026-10-20T06:00:00Z'),
        endAt: new Date('2026-10-20T07:00:00Z'),
        product: 'HOURLY',
      }),
    ).toBe(true);
  });

  it('treats a daily stay as open when each day it touches has hours', () => {
    expect(open(weekdays, '2026-10-20 00:00', '2026-10-21 00:00', 'DAILY')).toBe(true);
    expect(open(weekdays, '2026-10-17 00:00', '2026-10-18 00:00', 'DAILY')).toBe(false); // Saturday
  });
});

describe('extensionWindow (FR-BOOK-005: how far a stay can be extended)', () => {
  // Monday 2026-10-26 open 24h, Tuesday 07:00–22:00 (the reported case).
  const mondayAllDay: OpeningDay[] = [
    { weekday: 1, is24h: true },
    { weekday: 2, is24h: false, opensAt: '07:00', closesAt: '22:00' },
  ];
  const window = (
    hours: OpeningDay[],
    currentEnd: string,
    maxEnd: string,
    product: 'HOURLY' | 'DAILY' = 'HOURLY',
  ) =>
    extensionWindow({
      hours,
      currentEndAt: lagos(currentEnd),
      maxEndAt: lagos(maxEnd),
      product,
    });

  it('cannot extend past midnight when the next day opens later, and says when it reopens', () => {
    const w = window(mondayAllDay, '2026-10-27 00:00', '2026-10-27 22:00');
    expect(w.extendableUntil).toBeNull();
    expect(w.closesAt).toEqual(lagos('2026-10-27 00:00'));
    expect(w.reopensAt).toEqual(lagos('2026-10-27 07:00'));
  });

  it('runs straight through consecutive 24-hour days up to the cap', () => {
    const allWeek: OpeningDay[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      is24h: true,
    }));
    const w = window(allWeek, '2026-10-27 00:00', '2026-10-27 06:00');
    expect(w).toEqual({
      extendableUntil: lagos('2026-10-27 06:00'),
      closesAt: null,
      reopensAt: null,
    });
  });

  it('stops at the closing time later the same day', () => {
    const w = window(mondayAllDay, '2026-10-27 20:00', '2026-10-28 08:00');
    expect(w.extendableUntil).toEqual(lagos('2026-10-27 22:00'));
    expect(w.closesAt).toEqual(lagos('2026-10-27 22:00'));
    // Wednesday has no hours and nothing else opens within a week but next Monday.
    expect(w.reopensAt).toEqual(lagos('2026-11-02 00:00'));
  });

  it('has nothing to offer when the cap is already reached', () => {
    expect(window(mondayAllDay, '2026-10-26 20:00', '2026-10-26 20:00')).toEqual({
      extendableUntil: null,
      closesAt: null,
      reopensAt: null,
    });
  });

  it('reports no reopening when the car park has no hours at all', () => {
    const w = window([], '2026-10-26 20:00', '2026-10-26 23:00');
    expect(w.extendableUntil).toBeNull();
    expect(w.closesAt).toEqual(lagos('2026-10-26 20:00'));
    expect(w.reopensAt).toBeNull();
  });

  it('stops a daily stay at the first day without hours', () => {
    const w = window(mondayAllDay, '2026-10-27 00:00', '2026-10-28 12:00', 'DAILY');
    expect(w.extendableUntil).toEqual(lagos('2026-10-28 00:00'));
    expect(w.closesAt).toEqual(lagos('2026-10-28 00:00'));
  });
});
