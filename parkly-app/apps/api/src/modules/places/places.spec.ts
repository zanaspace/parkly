import { describe, expect, it } from 'vitest';
import type { MapsProvider } from '../../providers/index.js';
import { world } from '../../test-helpers.js';

const search = (w: ReturnType<typeof world>, q: string, ip = '203.0.113.9') =>
  w.call('GET', `/v1/places/autocomplete?q=${encodeURIComponent(q)}`, {
    headers: { 'x-forwarded-for': ip },
  });

describe('GET /v1/places/autocomplete (FR-LOT-101, ADR 0014)', () => {
  it('returns Lagos places with coordinates, cached at the edge, without sign-in', async () => {
    const w = world();
    const res = await search(w, 'eko');
    expect(res.status).toBe(200);
    expect(res.body?.items).toEqual([
      {
        id: 'fake-eko',
        kind: 'PLACE',
        label: 'Eko Hotel',
        detail: 'Victoria Island, Lagos',
        lat: 6.4247,
        lng: 3.4284,
      },
    ]);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=600');
  });

  it('needs at least 2 characters', async () => {
    const res = await search(world(), 'e');
    expect([res.status, res.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
  });

  it('drops suggestions without coordinates and reports provider failures as MAPS_UNAVAILABLE', async () => {
    const partial: MapsProvider = {
      autocomplete: async () => [
        { placeId: '1', label: 'A', detail: '', location: null },
        { placeId: '2', label: 'B', detail: 'Lagos', location: { lat: 6.5, lng: 3.4 } },
      ],
      placeDetails: async () => ({ lat: 0, lng: 0, formattedAddress: '' }),
    };
    expect((await search(world({ maps: partial }), 'ab')).body?.items).toEqual([
      { id: '2', kind: 'PLACE', label: 'B', detail: 'Lagos', lat: 6.5, lng: 3.4 },
    ]);
    const down: MapsProvider = {
      autocomplete: async () => {
        throw new Error('timeout');
      },
      placeDetails: async () => ({ lat: 0, lng: 0, formattedAddress: '' }),
    };
    const res = await search(world({ maps: down }), 'eko');
    expect([res.status, res.body?.code]).toEqual([502, 'MAPS_UNAVAILABLE']);
  });

  it('is rate limited per IP', async () => {
    const w = world();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await search(w, 'eko', '198.51.100.20')).status;
    expect(last).toBe(429);
  });
});
