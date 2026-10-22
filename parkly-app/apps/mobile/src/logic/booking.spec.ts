import { describe, expect, it } from 'vitest';
import { bookingWindowLabel, checkoutState, statusLabel } from './booking';

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
