import type { OperatorBooking } from '@parkly/contracts';

/** Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STATUS_OPTIONS = [
  { value: '', label: 'All bookings' },
  { value: 'CONFIRMED', label: 'Paid, not arrived' },
  { value: 'CHECKED_IN', label: 'Parked now' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'NO_SHOW', label: 'No-show' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

const STATUS_LABEL: Record<OperatorBooking['status'], string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Paid, not arrived',
  CHECKED_IN: 'Parked now',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  NO_SHOW: 'No-show',
};
export const statusLabel = (s: OperatorBooking['status']) => STATUS_LABEL[s];

export type BookingFilters = { from: string; to: string; lotId: string; status: string };

const lagosKey = (ms: number) => new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Reads the page's search params. Missing or malformed values fall back to the
 * last 7 days (today included) across all car parks; the API checks the rest.
 */
export function readFilters(
  params: Record<string, string | string[] | undefined>,
  now: number,
): BookingFilters {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === 'string' ? v : '';
  };
  const from = one('from');
  const to = one('to');
  const status = one('status');
  return {
    from: DATE.test(from) ? from : lagosKey(now - 6 * DAY_MS),
    to: DATE.test(to) ? to : lagosKey(now),
    lotId: UUID.test(one('lotId')) ? one('lotId') : '',
    status: STATUS_OPTIONS.some((o) => o.value === status) ? status : '',
  };
}

/** Query string for the API and the page links, without empty filters. */
export function filterQuery(f: BookingFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.lotId) q.set('lotId', f.lotId);
  if (f.status) q.set('status', f.status);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

/** "₦1,500.00" from kobo, with no floating point. */
export function naira(kobo: number): string {
  const whole = Math.trunc(kobo / 100).toLocaleString('en-NG');
  return `₦${whole}.${String(Math.abs(kobo) % 100).padStart(2, '0')}`;
}

/** "Mon 19 Oct, 10:00–12:00" in Lagos; the end shows its date when it is another day. */
export function stayLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string, withDate: boolean) =>
    new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      ...(withDate ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  const sameDay = lagosKey(Date.parse(startIso)) === lagosKey(Date.parse(endIso) - 1);
  return `${fmt(startIso, true)}–${fmt(endIso, !sameDay)}`;
}

/** "10:05" in Lagos, or an em dash when there is no time. */
export function timeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
