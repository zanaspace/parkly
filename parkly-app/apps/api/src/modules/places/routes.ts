import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { PlacesQuerySchema, PlacesResponseSchema, type PlaceSuggestion } from '@parkly/contracts';
import { lagosDateKey } from '@parkly/domain/time';
import type { AppDeps } from '../../app.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp, retryAfterSec, type LimitRule } from '../../middleware/rate-limit.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
/** Car parks matched by name, shown above places. */
const MAX_LOTS = 5;
/** Each keystroke pause is one request; the clients wait 300 ms before asking. */
const PLACES_IP: LimitRule = { name: 'places-ip', limit: 60, windowSec: 60 };

/**
 * D-11 destination search (FR-LOT-101, ADR 0014). Public; the provider key
 * stays on the server. Car parks whose name matches come first, so a driver
 * can type the car park's name. Cached at the edge for 10 minutes, so a lot
 * that goes live or is paused shows up soon (doc 01 §9 geocoding cache).
 */
export function placesRoutes(deps: AppDeps) {
  const app = new OpenAPIHono();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/places/autocomplete',
      tags: ['places'],
      request: { query: PlacesQuerySchema },
      responses: { 200: { description: 'Places in Lagos', ...json(PlacesResponseSchema) } },
    }),
    async (c) => {
      const limited = await deps.rateLimiter.limit(
        `ip:${clientIp(c.req.header('x-forwarded-for'))}`,
        PLACES_IP,
      );
      if (!limited.success)
        throw new ApiError('RATE_LIMITED', undefined, {
          headers: { 'retry-after': retryAfterSec(limited.reset, deps.now()) },
        });
      const { q } = c.req.valid('query');
      // Only lots drivers may see (LIVE, permit and visit current): same rule as search.
      const [lots, places] = await Promise.all([
        deps.store.lots.searchLiveByName(q, lagosDateKey(deps.now()), MAX_LOTS),
        deps.maps.autocomplete({ query: q, sessionToken: '' }).catch((err: unknown) => {
          deps.logger.warn({ err }, 'place search failed');
          return null;
        }),
      ]);
      if (!places && lots.length === 0)
        throw new ApiError(
          'MAPS_UNAVAILABLE',
          'Place search is unavailable. Pick an area instead.',
        );
      const items: PlaceSuggestion[] = [
        ...lots.map((l) => ({
          id: l.id,
          kind: 'LOT' as const,
          label: l.name,
          detail: l.addressLine,
          lat: l.location.lat,
          lng: l.location.lng,
        })),
        ...(places ?? []).flatMap((s) =>
          s.location
            ? [
                {
                  id: s.placeId,
                  kind: 'PLACE' as const,
                  label: s.label,
                  detail: s.detail,
                  lat: s.location.lat,
                  lng: s.location.lng,
                },
              ]
            : [],
        ),
      ];
      c.header('cache-control', 'public, s-maxage=600');
      return c.json({ items }, 200);
    },
  );

  return app;
}
