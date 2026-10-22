import type { QuoteLine } from '@parkly/contracts';

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

export const DURATIONS = [1, 2, 3, 4, 6, 8, 10, 12] as const;

/** Africa/Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const QUARTER_MS = 15 * 60 * 1000;

const lagosParts = (d: Date) => {
  const iso = new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

/** `YYYY-MM-DD` + `HH:MM` in Lagos → the instant. */
export function lagosInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+01:00`);
}

export type SearchInput = {
  lat: number;
  lng: number;
  /** What the driver searched from, for the heading ("near you" or the area). */
  place: string;
  date: string;
  time: string;
  /** Hours, or 'day' for a full day. */
  duration: number | 'day';
  sort: 'distance' | 'price';
  radiusM: number;
};

/** The next full hour in Lagos, today, as the default start. */
export function defaultStart(now: Date): { date: string; time: string } {
  const nextHour = new Date(Math.ceil((now.getTime() + 1) / (4 * QUARTER_MS)) * 4 * QUARTER_MS);
  return lagosParts(nextHour);
}

const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Reads `/search?…` query params (all strings, possibly missing or bad) into
 * a search, falling back to Victoria Island from the next full hour for 2 hours.
 */
export function readSearch(
  params: Record<string, string | string[] | undefined>,
  now: Date,
): SearchInput {
  const area = AREAS.find((a) => a.key === pick(params.area)) ?? AREAS[0];
  const lat = Number(pick(params.lat));
  const lng = Number(pick(params.lng));
  const useCoords = Number.isFinite(lat) && Number.isFinite(lng) && pick(params.lat) !== undefined;
  const fallback = defaultStart(now);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(pick(params.date) ?? '')
    ? (pick(params.date) as string)
    : fallback.date;
  const time = /^([01]\d|2[0-3]):(00|15|30|45)$/.test(pick(params.time) ?? '')
    ? (pick(params.time) as string)
    : fallback.time;
  const rawDuration = pick(params.duration);
  const hours = Number(rawDuration);
  const duration =
    rawDuration === 'day' ? 'day' : (DURATIONS as readonly number[]).includes(hours) ? hours : 2;
  const radius = Number(pick(params.radius));
  return {
    lat: useCoords ? lat : area.lat,
    lng: useCoords ? lng : area.lng,
    place: useCoords ? 'your location' : area.label,
    date,
    time,
    duration,
    sort: pick(params.sort) === 'price' ? 'price' : 'distance',
    radiusM: [2000, 3000, 5000].includes(radius) ? radius : 2000,
  };
}

/** The API window: hours from the start time, or the whole Lagos day. */
export function searchWindow(s: Pick<SearchInput, 'date' | 'time' | 'duration'>): {
  startAt: string;
  endAt: string;
  product: 'HOURLY' | 'DAILY';
} {
  if (s.duration === 'day') {
    const start = lagosInstant(s.date, '00:00');
    return {
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      product: 'DAILY',
    };
  }
  const start = lagosInstant(s.date, s.time);
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + s.duration * 60 * 60 * 1000).toISOString(),
    product: 'HOURLY',
  };
}

/** Query string for links that keep the same search (sort, wider radius, lot page). */
export function searchQuery(s: SearchInput, change: Partial<SearchInput> = {}): string {
  const next = { ...s, ...change };
  const area = AREAS.find((a) => a.label === next.place);
  const params = new URLSearchParams({
    ...(area ? { area: area.key } : { lat: String(next.lat), lng: String(next.lng) }),
    date: next.date,
    time: next.time,
    duration: String(next.duration),
    sort: next.sort,
    radius: String(next.radiusM),
  });
  return params.toString();
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
export function windowLabel(s: Pick<SearchInput, 'date' | 'time' | 'duration'>): string {
  if (s.duration === 'day') return `${dayLabel(s.date)}, all day`;
  return `${dayLabel(s.date)}, ${s.time} for ${s.duration} hour${s.duration === 1 ? '' : 's'}`;
}

/** Words for the server's quote lines (the client never computes prices). */
export function lineLabel(line: QuoteLine): string {
  switch (line.kind) {
    case 'HOURLY_DAY': {
      const h = line.minutes / 60;
      const hours = Number.isInteger(h) ? `${h} h` : `${Math.floor(h)} h ${line.minutes % 60} min`;
      return `${dayLabel(line.date)} · ${hours}${line.capped ? ' (daily maximum)' : ''}`;
    }
    case 'DAY':
      return `${dayLabel(line.date)} · full day`;
    case 'MONTH':
      return `${dayLabel(line.periodStart)} to ${dayLabel(line.periodEnd)}`;
    case 'SERVICE_FEE':
      return 'Parkly service fee';
  }
}

/** Lagos dates the date picker allows: today up to 30 days ahead (doc 02 §5). */
export function dateRange(now: Date): { today: string; lastDay: string } {
  return {
    today: lagosParts(now).date,
    lastDay: lagosParts(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)).date,
  };
}

/** Lagos weekday (0 = Sunday) of a date, for highlighting today's hours. */
export function lagosWeekday(now: Date): number {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).getUTCDay();
}
