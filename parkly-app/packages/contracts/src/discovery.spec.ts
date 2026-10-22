import { describe, expect, it } from 'vitest';
import { LotSearchQuerySchema, QuoteRequestSchema } from './discovery.js';

const window = { startAt: '2026-10-21T07:00:00.000Z', endAt: '2026-10-21T17:00:00.000Z' };

describe('discovery contracts (FR-LOT-101)', () => {
  it('reads query strings with defaults', () => {
    const q = LotSearchQuerySchema.parse({ lat: '6.4281', lng: '3.4219', ...window });
    expect(q).toMatchObject({
      lat: 6.4281,
      lng: 3.4219,
      radiusM: 2000,
      product: 'HOURLY',
      sort: 'distance',
      amenities: [],
    });
  });

  it('splits amenities and refuses unknown ones and radii over 5 km', () => {
    expect(
      LotSearchQuerySchema.parse({ lat: 6.4, lng: 3.4, ...window, amenities: 'CCTV,GUARD' })
        .amenities,
    ).toEqual(['CCTV', 'GUARD']);
    expect(
      LotSearchQuerySchema.safeParse({ lat: 6.4, lng: 3.4, ...window, amenities: 'POOL' }).success,
    ).toBe(false);
    expect(
      LotSearchQuerySchema.safeParse({ lat: 6.4, lng: 3.4, ...window, radiusM: 9000 }).success,
    ).toBe(false);
  });

  it('quotes any product', () => {
    expect(QuoteRequestSchema.safeParse({ product: 'MONTHLY', ...window }).success).toBe(true);
    expect(QuoteRequestSchema.safeParse({ product: 'WEEKLY', ...window }).success).toBe(false);
  });
});
