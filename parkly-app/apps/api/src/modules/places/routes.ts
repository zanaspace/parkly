import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { PlacesQuerySchema, PlacesResponseSchema } from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp, retryAfterSec, type LimitRule } from '../../middleware/rate-limit.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
/** Each keystroke pause is one request; the clients wait 300 ms before asking. */
const PLACES_IP: LimitRule = { name: 'places-ip', limit: 60, windowSec: 60 };

/**
 * D-11 destination search (FR-LOT-101, ADR 0014). Public; the provider key
 * stays on the server. Same query → same answer, so the edge caches it for a
 * day (doc 01 §9 caching of geocoding results).
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
      let suggestions;
      try {
        suggestions = await deps.maps.autocomplete({ query: q, sessionToken: '' });
      } catch (err) {
        deps.logger.warn({ err }, 'place search failed');
        throw new ApiError(
          'MAPS_UNAVAILABLE',
          'Place search is unavailable. Pick an area instead.',
        );
      }
      const items = suggestions.flatMap((s) =>
        s.location
          ? [
              {
                id: s.placeId,
                label: s.label,
                detail: s.detail,
                lat: s.location.lat,
                lng: s.location.lng,
              },
            ]
          : [],
      );
      c.header('cache-control', 'public, s-maxage=86400');
      return c.json({ items }, 200);
    },
  );

  return app;
}
