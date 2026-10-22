import type { MapsProvider, PlaceSuggestion } from './index.js';

/** Lagos State, as west,south,east,north for LocationIQ's `viewbox` (doc 00 Q1, domain bounds). */
const LAGOS_VIEWBOX = '2.69,6.36,4.36,6.71';

type LocationIqPlace = {
  place_id?: unknown;
  osm_id?: unknown;
  lat?: unknown;
  lon?: unknown;
  display_place?: unknown;
  display_address?: unknown;
  display_name?: unknown;
};

/**
 * LocationIQ Autocomplete (ADR 0014): OpenStreetMap places, restricted to
 * Nigeria and Lagos State. Returns coordinates with each suggestion, so no
 * second "place details" call is needed. The key never leaves the server.
 */
export function locationIqMaps(options: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): MapsProvider {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? 'https://api.locationiq.com/v1').replace(/\/$/, '');

  return {
    async autocomplete({ query }) {
      const params = new URLSearchParams({
        key: options.apiKey,
        q: query,
        countrycodes: 'ng',
        viewbox: LAGOS_VIEWBOX,
        bounded: '1',
        limit: '6',
        dedupe: '1',
        normalizecity: '1',
        format: 'json',
      });
      const res = await doFetch(`${base}/autocomplete?${params.toString()}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      });
      // 404 means "no matches" in LocationIQ's API.
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`locationiq autocomplete failed: HTTP ${res.status}`);
      const body: unknown = await res.json();
      if (!Array.isArray(body)) return [];
      return body.flatMap((p: LocationIqPlace): PlaceSuggestion[] => {
        const lat = Number(p.lat);
        const lng = Number(p.lon);
        const id = p.place_id ?? p.osm_id;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || id === undefined) return [];
        const name = typeof p.display_name === 'string' ? p.display_name : '';
        const label =
          typeof p.display_place === 'string' ? p.display_place : (name.split(',')[0] ?? '');
        const detail =
          typeof p.display_address === 'string'
            ? p.display_address
            : name.split(',').slice(1).join(',').trim();
        return [{ placeId: String(id), label, detail, location: { lat, lng } }];
      });
    },
    async placeDetails() {
      // Suggestions already carry coordinates; there is nothing more to look up.
      throw new Error('locationiq: placeDetails is not used (suggestions include coordinates)');
    },
  };
}
