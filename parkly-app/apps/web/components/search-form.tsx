'use client';

import type { PlaceSuggestion } from '@parkly/contracts';
import { Button, Select } from '@parkly/ui';
import { useEffect, useId, useState } from 'react';
import { AREAS, DURATIONS, type SearchInput } from '../lib/search';

/**
 * D-11 destination search (ADR 0014): suggestions from the API through
 * /api/places, asked for once typing pauses for 300 ms.
 */
function PlaceSearch({
  onPick,
}: {
  onPick: (p: { lat: number; lng: number; label: string }) => void;
}) {
  const listId = useId();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'none' | 'error'>('idle');

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q.trim())}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { items?: PlaceSuggestion[] };
        if (!res.ok) throw new Error(String(res.status));
        setItems(body.items ?? []);
        setStatus((body.items ?? []).length === 0 ? 'none' : 'idle');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  return (
    <div className="pk-places">
      <input
        className="pk-input"
        type="search"
        placeholder="Car park name or place, e.g. Falomo"
        aria-label="Search a car park or place"
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {items.length > 0 && (
        <ul id={listId} className="pk-places__list" role="listbox" aria-label="Car parks and places">
          {items.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button
                type="button"
                className="pk-places__item"
                onClick={() => onPick({ lat: p.lat, lng: p.lng, label: p.label })}
              >
                <span className="pk-places__label">
                  {p.kind === 'LOT' && <span className="pk-places__tag">Car park</span>}
                  {p.label}
                </span>
                {p.detail && <span className="pk-places__detail">{p.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {status === 'loading' && <p className="pk-hint">Searching…</p>}
      {status === 'none' && (
        <p className="pk-hint">No car parks or places found. Try another name, a landmark or an area.</p>
      )}
      {status === 'error' && (
        <p className="pk-hint">Place search isn’t available right now. Pick an area instead.</p>
      )}
    </div>
  );
}

const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});

/**
 * D-10/D-11: where and when. A plain GET form, so it works before JavaScript
 * loads; "Use my location" needs the browser's permission.
 */
export function SearchForm(props: {
  initial: SearchInput;
  today: string;
  lastDay: string;
  action?: string;
}) {
  const fromArea = AREAS.some((a) => a.label === props.initial.place);
  // A place picked from suggestions, or the device location ("your location").
  const [picked, setPicked] = useState<{ lat: number; lng: number; label: string } | null>(
    fromArea
      ? null
      : { lat: props.initial.lat, lng: props.initial.lng, label: props.initial.place },
  );
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [duration, setDuration] = useState(String(props.initial.duration));
  const area = AREAS.find((a) => a.label === props.initial.place)?.key ?? AREAS[0].key;

  function locate() {
    setLocError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPicked({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'your location' });
      },
      () => {
        setLocating(false);
        setLocError('We couldn’t get your location. Pick an area instead.');
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  return (
    <form action={props.action ?? '/search'} method="get" className="pk-search">
      <div className="pk-field">
        <label className="pk-field__label" htmlFor="search-area">
          Where
        </label>
        {picked ? (
          <div className="pk-row">
            <span className="pk-chip pk-chip--on">
              {picked.label === 'your location' ? 'Near your location' : picked.label}
            </span>
            <input type="hidden" name="lat" value={picked.lat.toFixed(5)} />
            <input type="hidden" name="lng" value={picked.lng.toFixed(5)} />
            {picked.label !== 'your location' && (
              <input type="hidden" name="place" value={picked.label} />
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <div className="pk-row">
              <PlaceSearch onPick={setPicked} />
              <Button type="button" variant="ghost" size="sm" loading={locating} onClick={locate}>
                Near me
              </Button>
            </div>
            <div className="pk-row">
              <label className="pk-hint" htmlFor="search-area">
                or pick an area
              </label>
              <Select
                id="search-area"
                name="area"
                defaultValue={area}
                options={AREAS.map((a) => ({ value: a.key, label: a.label }))}
              />
            </div>
          </>
        )}
        {locError && <p className="pk-hint">{locError}</p>}
      </div>

      <div className="pk-search__when">
        <div className="pk-field">
          <label className="pk-field__label" htmlFor="search-date">
            Date
          </label>
          <input
            id="search-date"
            name="date"
            type="date"
            className="pk-input"
            defaultValue={props.initial.date}
            min={props.today}
            max={props.lastDay}
            required
          />
        </div>
        <Select
          label="How long"
          id="search-duration"
          name="duration"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          options={[
            ...DURATIONS.map((h) => ({
              value: String(h),
              label: h === '5m' ? '5 min (Test)' : `${h} hour${h === 1 ? '' : 's'}`,
            })),
            { value: 'day', label: 'Full day' },
          ]}
        />
        {duration !== 'day' && (
          <Select
            label="Arrive at"
            id="search-time"
            name="time"
            defaultValue={props.initial.time}
            options={TIMES.map((t) => ({ value: t, label: t }))}
          />
        )}
      </div>
      <Button type="submit" fullWidth>
        Find parking
      </Button>
    </form>
  );
}
