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

const MINUTE = 60_000;

export type StayTimer =
  | { phase: 'NOT_IN' }
  /** Inside the booked time: counting down to the end. */
  | { phase: 'PARKED'; parkedMs: number; leftMs: number }
  /** Time is up; the free grace before overstay is running out. */
  | { phase: 'GRACE'; parkedMs: number; graceLeftMs: number }
  /** Past end + grace without leaving: overstay is counting (charged after check-out). */
  | { phase: 'OVERSTAY'; parkedMs: number; overMs: number }
  | { phase: 'DONE'; parkedMs: number; overMs: number };

/**
 * The driver's timer (ADR 0016) from the gate's check-in and check-out times.
 * Only times: the overstay amount always comes from the server.
 */
export function stayTimer(input: {
  now: Date;
  endAt: Date;
  graceMin: number;
  stay: { checkedInAt: string | null; checkedOutAt: string | null } | null;
}): StayTimer {
  const inAt = input.stay?.checkedInAt ? Date.parse(input.stay.checkedInAt) : null;
  if (inAt === null) return { phase: 'NOT_IN' };
  const end = input.endAt.getTime();
  const outAt = input.stay?.checkedOutAt ? Date.parse(input.stay.checkedOutAt) : null;
  if (outAt !== null)
    return { phase: 'DONE', parkedMs: outAt - inAt, overMs: Math.max(0, outAt - end) };
  const now = input.now.getTime();
  const parkedMs = Math.max(0, now - inAt);
  if (now < end) return { phase: 'PARKED', parkedMs, leftMs: end - now };
  const graceEnd = end + input.graceMin * MINUTE;
  if (now < graceEnd) return { phase: 'GRACE', parkedMs, graceLeftMs: graceEnd - now };
  return { phase: 'OVERSTAY', parkedMs, overMs: now - end };
}

/** "2 h 35 min", "45 min", "2 h", "less than a minute". */
export function durationLabel(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE);
  if (minutes < 1) return 'less than a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A ticking clock: "1:20:15". */
export function clockLabel(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
