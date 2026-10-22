import {
  addDays,
  AREAS,
  dateRange,
  dayLabel,
  defaultStart,
  DURATIONS,
  type Duration,
} from '@parkly/domain/discovery';

/** What the driver picked on Home; passed to Results and Lot as route params. */
export type SearchState = {
  /** An area key, or null when searching near the device's location. */
  area: string | null;
  coords: { lat: number; lng: number } | null;
  date: string;
  time: string;
  duration: Duration;
  sort: 'distance' | 'price';
};

export function initialSearch(now: Date): SearchState {
  const start = defaultStart(now);
  return { area: AREAS[0].key, coords: null, ...start, duration: 2, sort: 'distance' };
}

/** The next 7 Lagos days as chips: "Today", "Tomorrow", then "Sat 24 Oct". */
export function dayChoices(now: Date): { date: string; label: string }[] {
  const { today } = dateRange(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return { date, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(date) };
  });
}

/** Moves a `HH:MM` time by whole quarter hours, staying within the day. */
export function stepTime(time: string, quarters: number): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const minutes = Math.min(23 * 60 + 45, Math.max(0, h * 60 + m + quarters * 15));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function durationLabel(d: Duration): string {
  return d === 'day' ? 'Full day' : `${d} h`;
}

/** Where the search is centred, and how to describe it. */
export function searchPoint(s: SearchState): { lat: number; lng: number; place: string } {
  if (s.coords) return { ...s.coords, place: 'your location' };
  const area = AREAS.find((a) => a.key === s.area) ?? AREAS[0];
  return { lat: area.lat, lng: area.lng, place: area.label };
}

/** Route params are strings; these two keep a search intact across screens. */
export function toParams(s: SearchState): Record<string, string> {
  return {
    ...(s.coords
      ? { lat: String(s.coords.lat), lng: String(s.coords.lng) }
      : { area: s.area ?? AREAS[0].key }),
    date: s.date,
    time: s.time,
    duration: String(s.duration),
    sort: s.sort,
  };
}

export function fromParams(
  p: Record<string, string | string[] | undefined>,
  now: Date,
): SearchState {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const base = initialSearch(now);
  const lat = Number(one(p.lat));
  const lng = Number(one(p.lng));
  const hasCoords = one(p.lat) !== undefined && Number.isFinite(lat) && Number.isFinite(lng);
  const area = AREAS.find((a) => a.key === one(p.area))?.key ?? base.area;
  const hours = Number(one(p.duration));
  return {
    area: hasCoords ? null : area,
    coords: hasCoords ? { lat, lng } : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(one(p.date) ?? '') ? (one(p.date) as string) : base.date,
    time: /^([01]\d|2[0-3]):(00|15|30|45)$/.test(one(p.time) ?? '')
      ? (one(p.time) as string)
      : base.time,
    duration:
      one(p.duration) === 'day'
        ? 'day'
        : (DURATIONS as readonly number[]).includes(hours)
          ? hours
          : base.duration,
    sort: one(p.sort) === 'price' ? 'price' : 'distance',
  };
}
