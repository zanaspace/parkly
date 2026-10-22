import { dayLabel } from '../discovery/discovery.js';
import type { BookingStatus } from './booking.js';

/** Words for bookings shared by the app and the website. */

const STATUS: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Parked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Not paid in time',
  NO_SHOW: 'Missed',
};

export const statusLabel = (s: BookingStatus): string => STATUS[s];

/** Africa/Lagos is UTC+1 all year. */
const lagos = (iso: string) => {
  const t = new Date(Date.parse(iso) + 60 * 60 * 1000).toISOString();
  return { date: t.slice(0, 10), time: t.slice(11, 16) };
};

/** "Fri 23 Oct, 08:00–10:00", or both days when the stay crosses midnight. */
export function bookingWindowLabel(b: { startAt: string; endAt: string }): string {
  const s = lagos(b.startAt);
  const e = lagos(b.endAt);
  if (s.date === e.date) return `${dayLabel(s.date)}, ${s.time}–${e.time}`;
  return `${dayLabel(s.date)}, ${s.time} – ${dayLabel(e.date)}, ${e.time}`;
}

export type CheckoutState = 'waiting' | 'paid' | 'failed' | 'expired' | 'refunding';

/**
 * What the payment screen shows next. Only the server's word counts: the
 * booking is paid when the API says CONFIRMED (it checked with Paystack).
 */
export function checkoutState(s: { booking: BookingStatus; payment: string }): CheckoutState {
  if (s.booking === 'CONFIRMED') return 'paid';
  if (s.booking === 'PENDING_PAYMENT') return 'waiting';
  if (s.payment === 'FAILED') return 'failed';
  if (s.payment === 'SUCCEEDED') return 'refunding';
  return 'expired';
}
