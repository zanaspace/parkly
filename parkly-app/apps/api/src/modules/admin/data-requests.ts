import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { DataRequestListQuerySchema, DataRequestListSchema } from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

/**
 * NFR-PRIV-001: compliance sees every data request and when it is due, so none
 * passes its date unnoticed (doc 06 section 11: answer within the NDPA window).
 * A person shows as first name only. Read-only: the requests are carried out by
 * the account-erasure job and the driver's own export.
 */
export function adminDataRequestRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/data-requests',
      tags: ['admin'],
      ...secured,
      request: { query: DataRequestListQuerySchema },
      responses: { 200: { description: 'Data requests', ...json(DataRequestListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'dsar:read', {});
      const { status, type } = c.req.valid('query');
      const now = deps.now();
      const rows = await deps.store.dataRequests.listAdmin({ status, type, limit: 200 });
      return c.json(
        {
          items: rows.map((r) => ({
            id: r.id,
            type: r.type,
            status: r.status,
            userFirstName: r.userFirstName,
            userStatus: r.userStatus,
            createdAt: r.createdAt.toISOString(),
            dueAt: r.dueAt.toISOString(),
            completedAt: r.completedAt ? r.completedAt.toISOString() : null,
            overdue: (r.status === 'OPEN' || r.status === 'IN_PROGRESS') && r.dueAt < now,
          })),
        },
        200,
      );
    },
  );

  return app;
}
