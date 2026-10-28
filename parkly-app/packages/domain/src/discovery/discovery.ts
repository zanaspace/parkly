import type { QuoteLine } from '../pricing/quote.js';

/**
 * Driver search shared by the website and the mobile app (doc 03 §1.2–1.3):
 * where to search from, the time window in Lagos, and the words for results.
 * Prices are never computed here: quotes come from the API.
 */

/**
 * Places a driver can search from until Google Places is connected (S3 story 7).
 * Victoria Island first: the pilot node and default centre (doc 00 Q1).
 */
export const AREAS = [
  { key: 'victoria-island', label: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
  { key: 'ikoyi', label: 'Ikoyi', lat: 6.452, lng: 3.435 },
  { key: 'lekki-phase-1', label: 'Lekki Phase 1', lat: 6.4474, lng: 3.472 },
  { key: 'lagos-island', label: 'Lagos Island (Marina)', lat: 6.4541, lng: 3.3947 },
  { key: 'ikeja-gra', label: 'Ikeja GRA', lat: 6.5806, lng: 3.3567 },
  { key: 'yaba', label: 'Yaba', lat: 6.5095, lng: 3.3711 },
  { key: 'surulere', label: 'Surulere', lat: 6.4969, lng: 3.355 },
  { key: 'maryland', label: 'Maryland', lat: 6.5715, lng: 3.3655 },
  { key: 'ajah', label: 'Ajah', lat: 6.4698, lng: 3.5852 },
] as const;
export type Area = (typeof AREAS)[number];

/** Hourly stays offered in the pickers; '5m' is a 5-minute test stay (for testing overstay); 'day' is a full Lagos day. */
export const DURATIONS = [1, 2, 3, 4, 6, 8, 10, 12] as const;
/** Pickers with the 5-minute test stay first; only where test stays are switched on, never in prod. */
export const TEST_DURATIONS = ['5m', ...DURATIONS] as const;
export type Duration = (typeof TEST_DURATIONS)[number] | 'day';

export function durationsFor(testStays: boolean): readonly Exclude<Duration, 'day'>[] {
  return testStays ? TEST_DURATIONS : DURATIONS;
}

/** Doc 03 §1.2: widen an empty 2 km search to 3 km, then offer 5 km. */
export const SEARCH_RADII = [2000, 3000, 5000] as const;

/** Africa/Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const lagosParts = (d: Date) => {
  const iso = new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

/** `YYYY-MM-DD` + `HH:MM` in Lagos → the instant. */
export function lagosInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+01:00`);
}

/** The next full hour in Lagos, as the default start of a search. */
export function defaultStart(now: Date): { date: string; time: string } {
  return lagosParts(new Date(Math.ceil((now.getTime() + 1) / HOUR_MS) * HOUR_MS));
}

/** Lagos dates a driver may pick: today up to 30 days ahead (doc 02 §5). */
export function dateRange(now: Date): { today: string; lastDay: string } {
  return {
    today: lagosParts(now).date,
    lastDay: lagosParts(new Date(now.getTime() + 30 * DAY_MS)).date,
  };
}

/** The Lagos date `days` after `date`. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Lagos weekday (0 = Sunday) at `now`, for highlighting today's hours. */
export function lagosWeekday(now: Date): number {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).getUTCDay();
}

/** The API window: hours from the start time, or the whole Lagos day. */
export function searchWindow(s: { date: string; time: string; duration: Duration }): {
  startAt: string;
  endAt: string;
  product: 'HOURLY' | 'DAILY';
} {
  if (s.duration === 'day') {
    const start = lagosInstant(s.date, '00:00');
    return {
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + DAY_MS).toISOString(),
      product: 'DAILY',
    };
  }
  if (s.duration === '5m') {
    const start = lagosInstant(s.date, s.time);
    return {
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 5 * 60_000).toISOString(),
      product: 'HOURLY',
    };
  }
  const start = lagosInstant(s.date, s.time);
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + (s.duration as number) * HOUR_MS).toISOString(),
    product: 'HOURLY',
  };
}

/** Doc 03 §1.2: a spaces-left band, "Few left" under 5. */
export function spacesLabel(available: number, isOpen: boolean): string {
  if (!isOpen) return 'Closed at that time';
  if (available <= 0) return 'Full';
  if (available < 5) return `Few left (${available})`;
  return `${available} spaces`;
}

export function distanceLabel(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m away`;
  return `${(metres / 1000).toFixed(1)} km away`;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 23 Oct" for a Lagos calendar date. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** "Fri 23 Oct, 08:00 for 10 hours" / "Fri 23 Oct, all day". */
export function windowLabel(s: { date: string; time: string; duration: Duration }): string {
  if (s.duration === 'day') return `${dayLabel(s.date)}, all day`;
  if (s.duration === '5m') return `${dayLabel(s.date)}, ${s.time} for 5 min (Test)`;
  return `${dayLabel(s.date)}, ${s.time} for ${s.duration} hour${s.duration === 1 ? '' : 's'}`;
}

/** Words for the server's quote lines. */
export function lineLabel(line: QuoteLine): string {
  switch (line.kind) {
    case 'HOURLY_DAY': {
      if (line.minutes === 5) return `${dayLabel(line.date)} · 5 min (Test)`;
      const h = line.minutes / 60;
      const hours = Number.isInteger(h) ? `${h} h` : `${Math.floor(h)} h ${line.minutes % 60} min`;
      return `${dayLabel(line.date)} · ${hours}${line.capped ? ' (daily maximum)' : ''}`;
    }
    case 'DAY':
      return `${dayLabel(line.date)} · full day`;
    case 'MONTH':
      return `${dayLabel(line.periodStart)} to ${dayLabel(line.periodEnd)}`;
    case 'EXTENSION':
      return `Extra ${line.minutes} min`;
    case 'OVERSTAY':
      return `Overstay ${line.minutes} min`;
    case 'SERVICE_FEE':
      return 'Parkly service fee';
  }
}
