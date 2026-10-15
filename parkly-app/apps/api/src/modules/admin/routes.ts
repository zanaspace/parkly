import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { AuditLogPageSchema, AuditLogQuerySchema } from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { ApiError } from '../../lib/errors.js';

/** Cursor = base64url("<createdAt ISO>|<id>"), newest first. */
function decodeCursor(cursor: string | undefined) {
  if (!cursor) return undefined;
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = at ? new Date(at) : undefined;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id)
    throw new ApiError('VALIDATION_FAILED', 'Invalid cursor');
  return { createdAt, id };
}

const encodeCursor = (row: { createdAt: Date; id: string }) =>
  Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');

/** Admin routes: MFA (aal2) required by the permission rules (doc 05 §5.2 rule 7). */
export function adminRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/audit-logs',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: { query: AuditLogQuerySchema },
      responses: {
        200: {
          description: 'Audit entries',
          content: { 'application/json': { schema: AuditLogPageSchema } },
        },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'audit:read', {});
      const q = c.req.valid('query');
      const rows = await deps.store.audit.list({
        entityType: q.entityType,
        entityId: q.entityId,
        actorUserId: q.actorUserId,
        before: decodeCursor(q.cursor),
        limit: q.limit + 1,
      });
      const page = rows.slice(0, q.limit);
      const last = page[page.length - 1];
      return c.json(
        {
          items: page.map((r) => ({
            id: r.id,
            actorUserId: r.actorUserId,
            actorRole: r.actorRole,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            requestId: r.requestId,
            createdAt: r.createdAt.toISOString(),
          })),
          nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
        },
        200,
      );
    },
  );

  return app;
}
