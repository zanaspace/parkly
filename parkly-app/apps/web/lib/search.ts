import { AREAS, defaultStart, DURATIONS, type Duration } from '@parkly/domain/discovery';

// Search rules and words shared with the mobile app live in @parkly/domain/discovery.
export {
  AREAS,
  dateRange,
  dayLabel,
  distanceLabel,
  DURATIONS,
  lagosWeekday,
  lineLabel,
  searchWindow,
  spacesLabel,
  windowLabel,
} from '@parkly/domain/discovery';

export type SearchInput = {
  lat: number;
  lng: number;
  /** What the driver searched from, for the heading ("your location" or the area). */
  place: string;
  date: string;
  time: string;
  duration: Duration;
  sort: 'distance' | 'price';
  radiusM: number;
};

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
    // A place picked from suggestions keeps its name; bare coordinates are "your location".
    place: useCoords ? pick(params.place)?.trim().slice(0, 80) || 'your location' : area.label,
    date,
    time,
    duration,
    sort: pick(params.sort) === 'price' ? 'price' : 'distance',
    radiusM: [2000, 3000, 5000].includes(radius) ? radius : 2000,
  };
}

/** Query string for links that keep the same search (sort, wider radius, lot page). */
export function searchQuery(s: SearchInput, change: Partial<SearchInput> = {}): string {
  const next = { ...s, ...change };
  const area = AREAS.find((a) => a.label === next.place);
  const params = new URLSearchParams({
    ...(area
      ? { area: area.key }
      : {
          lat: String(next.lat),
          lng: String(next.lng),
          ...(next.place !== 'your location' ? { place: next.place } : {}),
        }),
    date: next.date,
    time: next.time,
    duration: String(next.duration),
    sort: next.sort,
    radius: String(next.radiusM),
  });
  return params.toString();
}
