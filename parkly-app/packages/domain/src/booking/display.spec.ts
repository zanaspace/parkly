import { describe, expect, it } from 'vitest';
import {
  bookingWindowLabel,
  checkoutState,
  clockLabel,
  durationLabel,
  statusLabel,
  stayTimer,
} from './display.js';

describe('booking words', () => {
  it('names every status the way drivers read it', () => {
    expect(statusLabel('PENDING_PAYMENT')).toBe('Waiting for payment');
    expect(statusLabel('CONFIRMED')).toBe('Confirmed');
    expect(statusLabel('CHECKED_IN')).toBe('Parked');
    expect(statusLabel('COMPLETED')).toBe('Completed');
    expect(statusLabel('CANCELLED')).toBe('Cancelled');
    expect(statusLabel('EXPIRED')).toBe('Not paid in time');
    expect(statusLabel('NO_SHOW')).toBe('Missed');
  });

  it('shows the window in Lagos time', () => {
    expect(
      bookingWindowLabel({
        startAt: '2026-10-23T07:00:00.000Z',
        endAt: '2026-10-23T09:00:00.000Z',
      }),
    ).toBe('Fri 23 Oct, 08:00–10:00');
    expect(
      bookingWindowLabel({
        startAt: '2026-10-23T22:00:00.000Z',
        endAt: '2026-10-24T01:00:00.000Z',
      }),
    ).toBe('Fri 23 Oct, 23:00 – Sat 24 Oct, 02:00');
  });
});

describe('checkout state', () => {
  it('is paid only when the server says the booking is confirmed', () => {
    expect(checkoutState({ booking: 'CONFIRMED', payment: 'SUCCEEDED' })).toBe('paid');
    expect(checkoutState({ booking: 'PENDING_PAYMENT', payment: 'PENDING' })).toBe('waiting');
    expect(checkoutState({ booking: 'PENDING_PAYMENT', payment: 'INITIATED' })).toBe('waiting');
  });

  it('stops waiting when the payment failed or the hold ran out', () => {
    expect(checkoutState({ booking: 'EXPIRED', payment: 'FAILED' })).toBe('failed');
    expect(checkoutState({ booking: 'EXPIRED', payment: 'PENDING' })).toBe('expired');
    expect(checkoutState({ booking: 'EXPIRED', payment: 'SUCCEEDED' })).toBe('refunding');
    expect(checkoutState({ booking: 'CANCELLED', payment: 'ABANDONED' })).toBe('expired');
  });
});

describe('stay timer (ADR 0016)', () => {
  const end = new Date('2026-10-23T11:00:00Z');
  const at = (iso: string) => new Date(`2026-10-23T${iso}:00Z`);
  const stay = (
    over: Partial<{ checkedInAt: string | null; checkedOutAt: string | null }> = {},
  ) => ({
    checkedInAt: '2026-10-23T09:05:00.000Z',
    checkedOutAt: null,
    ...over,
  });

  it('waits for the gate before it starts', () => {
    expect(stayTimer({ now: at('09:00'), endAt: end, graceMin: 10, stay: null })).toEqual({
      phase: 'NOT_IN',
    });
  });

  it('counts down to the end, then through the grace, then counts the overstay', () => {
    expect(stayTimer({ now: at('10:40'), endAt: end, graceMin: 10, stay: stay() })).toEqual({
      phase: 'PARKED',
      parkedMs: 95 * 60_000,
      leftMs: 20 * 60_000,
    });
    expect(stayTimer({ now: at('11:04'), endAt: end, graceMin: 10, stay: stay() })).toEqual({
      phase: 'GRACE',
      parkedMs: 119 * 60_000,
      graceLeftMs: 6 * 60_000,
    });
    expect(stayTimer({ now: at('11:35'), endAt: end, graceMin: 10, stay: stay() })).toEqual({
      phase: 'OVERSTAY',
      parkedMs: 150 * 60_000,
      overMs: 35 * 60_000,
    });
  });

  it('stops at check-out with the total time', () => {
    expect(
      stayTimer({
        now: at('13:00'),
        endAt: end,
        graceMin: 10,
        stay: stay({ checkedOutAt: '2026-10-23T11:40:00.000Z' }),
      }),
    ).toEqual({ phase: 'DONE', parkedMs: 155 * 60_000, overMs: 40 * 60_000 });
  });

  it('writes durations the way drivers read them', () => {
    expect(durationLabel(155 * 60_000)).toBe('2 h 35 min');
    expect(durationLabel(45 * 60_000)).toBe('45 min');
    expect(durationLabel(120 * 60_000)).toBe('2 h');
    expect(durationLabel(20_000)).toBe('less than a minute');
    expect(clockLabel(4815_000)).toBe('1:20:15');
    expect(clockLabel(-5)).toBe('0:00:00');
  });
});
