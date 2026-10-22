import { describe, expect, it } from 'vitest';
import { locationIqMaps } from './locationiq.js';

// Shaped like LocationIQ's /v1/autocomplete response (fields the adapter reads).
const ekoHotel = {
  place_id: '320148283',
  osm_id: '29071834',
  lat: '6.4247118',
  lon: '3.4284316',
  display_name: 'Eko Hotel, Adetokunbo Ademola Street, Victoria Island, Lagos, Nigeria',
  display_place: 'Eko Hotel',
  display_address: 'Adetokunbo Ademola Street, Victoria Island, Lagos, Nigeria',
};

function fakeFetch(status: number, body: unknown) {
  const urls: string[] = [];
  const fn = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, urls };
}

describe('LocationIQ address search (ADR 0014)', () => {
  it('asks for Lagos places only and maps suggestions with coordinates', async () => {
    const f = fakeFetch(200, [ekoHotel, { place_id: 'x', lat: 'bad', lon: '3.4' }]);
    const maps = locationIqMaps({ apiKey: 'pk.testkey123', fetch: f.fn });
    const results = await maps.autocomplete({ query: 'eko hotel', sessionToken: 's' });
    expect(results).toEqual([
      {
        placeId: '320148283',
        label: 'Eko Hotel',
        detail: 'Adetokunbo Ademola Street, Victoria Island, Lagos, Nigeria',
        location: { lat: 6.4247118, lng: 3.4284316 },
      },
    ]);
    const url = new URL(f.urls[0] ?? '');
    expect(url.pathname).toBe('/v1/autocomplete');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'eko hotel',
      countrycodes: 'ng',
      bounded: '1',
      viewbox: '2.69,6.36,4.36,6.71',
    });
  });

  it('falls back to the full name when the short parts are missing', async () => {
    const f = fakeFetch(200, [
      { osm_id: 9, lat: '6.45', lon: '3.43', display_name: 'Falomo, Ikoyi, Lagos' },
    ]);
    const [place] = await locationIqMaps({ apiKey: 'pk.testkey123', fetch: f.fn }).autocomplete({
      query: 'falomo',
      sessionToken: 's',
    });
    expect(place).toEqual({
      placeId: '9',
      label: 'Falomo',
      detail: 'Ikoyi, Lagos',
      location: { lat: 6.45, lng: 3.43 },
    });
  });

  it('treats 404 as no matches and other failures as errors', async () => {
    const none = locationIqMaps({ apiKey: 'pk.testkey123', fetch: fakeFetch(404, {}).fn });
    expect(await none.autocomplete({ query: 'zzzz', sessionToken: 's' })).toEqual([]);
    const down = locationIqMaps({ apiKey: 'pk.testkey123', fetch: fakeFetch(429, {}).fn });
    await expect(down.autocomplete({ query: 'eko', sessionToken: 's' })).rejects.toThrow(/429/);
    await expect(down.placeDetails({ placeId: '1', sessionToken: 's' })).rejects.toThrow();
  });
});
