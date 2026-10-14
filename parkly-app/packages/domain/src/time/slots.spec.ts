import { describe, expect, it } from 'vitest';
import {
  SLOT_MINUTES,
  ceil15Minutes,
  ceilToSlot,
  floorToSlot,
  isSlotAligned,
  lagosDateKey,
  slotStartsBetween,
} from './slots.js';

const t = (iso: string) => new Date(iso);

describe('slot alignment (15 min, UTC)', () => {
  it('uses 15-minute slots', () => {
    expect(SLOT_MINUTES).toBe(15);
  });
  it.each([
    ['2026-10-19T08:00:00.000Z', true],
    ['2026-10-19T08:45:00.000Z', true],
    ['2026-10-19T08:10:00.000Z', false],
    ['2026-10-19T08:15:01.000Z', false],
    ['2026-10-19T08:15:00.001Z', false],
  ])('isSlotAligned(%s) = %s', (iso, aligned) => {
    expect(isSlotAligned(t(iso))).toBe(aligned);
  });
  it('floors and ceils to slot boundaries', () => {
    expect(floorToSlot(t('2026-10-19T08:14:59.999Z')).toISOString()).toBe(
      '2026-10-19T08:00:00.000Z',
    );
    expect(ceilToSlot(t('2026-10-19T08:00:00.001Z')).toISOString()).toBe(
      '2026-10-19T08:15:00.000Z',
    );
    expect(ceilToSlot(t('2026-10-19T08:30:00.000Z')).toISOString()).toBe(
      '2026-10-19T08:30:00.000Z',
    );
  });
});

describe('slotStartsBetween', () => {
  it('lists each slot start in [start, end)', () => {
    const slots = slotStartsBetween(t('2026-10-19T08:00:00Z'), t('2026-10-19T09:00:00Z'));
    expect(slots.map((d) => d.toISOString())).toEqual([
      '2026-10-19T08:00:00.000Z',
      '2026-10-19T08:15:00.000Z',
      '2026-10-19T08:30:00.000Z',
      '2026-10-19T08:45:00.000Z',
    ]);
  });
  it('returns nothing for an empty window', () => {
    expect(slotStartsBetween(t('2026-10-19T08:00:00Z'), t('2026-10-19T08:00:00Z'))).toEqual([]);
  });
  it('rejects unaligned or reversed windows', () => {
    expect(() => slotStartsBetween(t('2026-10-19T08:05:00Z'), t('2026-10-19T09:00:00Z'))).toThrow(
      RangeError,
    );
    expect(() => slotStartsBetween(t('2026-10-19T09:00:00Z'), t('2026-10-19T08:00:00Z'))).toThrow(
      RangeError,
    );
  });
});

describe('ceil15Minutes', () => {
  it.each([
    [0, 0],
    [1, 15],
    [15, 15],
    [16, 30],
    [59, 60],
  ])('%d min → %d min', (m, r) => {
    expect(ceil15Minutes(m)).toBe(r);
  });
  it('treats negatives as zero', () => {
    expect(ceil15Minutes(-10)).toBe(0);
  });
});

describe('lagosDateKey (Africa/Lagos = UTC+1, no DST)', () => {
  it.each([
    ['2026-10-19T22:59:59Z', '2026-10-19'],
    ['2026-10-19T23:00:00Z', '2026-10-20'],
    ['2026-12-31T23:30:00Z', '2027-01-01'],
    ['2026-06-15T00:00:00Z', '2026-06-15'],
  ])('%s → %s', (iso, key) => {
    expect(lagosDateKey(t(iso))).toBe(key);
  });
});
