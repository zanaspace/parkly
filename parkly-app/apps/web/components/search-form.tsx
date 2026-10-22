'use client';

import { Button } from '@parkly/ui';
import { useState } from 'react';
import { AREAS, DURATIONS, type SearchInput } from '../lib/search';

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
  const near = props.initial.place === 'your location';
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    near ? { lat: props.initial.lat, lng: props.initial.lng } : null,
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
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
        {coords ? (
          <div className="pk-row">
            <span className="pk-chip pk-chip--on">Near your location</span>
            <input type="hidden" name="lat" value={coords.lat.toFixed(5)} />
            <input type="hidden" name="lng" value={coords.lng.toFixed(5)} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setCoords(null)}>
              Pick an area
            </Button>
          </div>
        ) : (
          <div className="pk-row">
            <select id="search-area" name="area" className="pk-input" defaultValue={area}>
              {AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="sm" loading={locating} onClick={locate}>
              Near me
            </Button>
          </div>
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
        <div className="pk-field">
          <label className="pk-field__label" htmlFor="search-duration">
            How long
          </label>
          <select
            id="search-duration"
            name="duration"
            className="pk-input"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            {DURATIONS.map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? '' : 's'}
              </option>
            ))}
            <option value="day">Full day</option>
          </select>
        </div>
        {duration !== 'day' && (
          <div className="pk-field">
            <label className="pk-field__label" htmlFor="search-time">
              Arrive at
            </label>
            <select
              id="search-time"
              name="time"
              className="pk-input"
              defaultValue={props.initial.time}
            >
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <Button type="submit" fullWidth>
        Find parking
      </Button>
    </form>
  );
}
