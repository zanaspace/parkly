import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { OperatorMemberListSchema } from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';

/**
 * Operator-scoped routes (`/operators/:operatorId/...`). Sprint 1 only has the
 * member list; it exists to prove tenant scoping end to end (FR-AUTH-005).
 */
export function operatorRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/members',
      tags: ['operators'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: { params: z.object({ operatorId: z.uuid() }) },
      responses: {
        200: {
          description: 'Members',
          content: { 'application/json': { schema: OperatorMemberListSchema } },
        },
      },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      // Another operator's id looks exactly like one that does not exist.
      authorize(c, deps.logger, 'operator:members:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      return c.json({ items: await deps.store.operators.members(operatorId) }, 200);
    },
  );

  return app;
}
