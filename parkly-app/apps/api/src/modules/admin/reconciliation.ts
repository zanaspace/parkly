import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ReconciliationItemListQuerySchema,
  ReconciliationItemListResponseSchema,
  ReconciliationItemSchema,
  ReconciliationRunListQuerySchema,
  ReconciliationRunListResponseSchema,
  ReconciliationRunSchema,
  ResolveReconciliationItemRequestSchema,
} from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import type { ReconciliationItemRow, ReconciliationRunRow } from '../../store/types.js';

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

function serializeRun(r: ReconciliationRunRow) {
  return {
    id: r.id,
    businessDate: r.businessDate,
    provider: r.provider,
    status: r.status,
    totalInternal: r.totalInternal,
    totalProvider: r.totalProvider,
    matchedCount: r.matchedCount,
    mismatchedCount: r.mismatchedCount,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeItem(i: ReconciliationItemRow) {
  return {
    id: i.id,
    runId: i.runId,
    paymentId: i.paymentId,
    providerReference: i.providerReference,
    result: i.result,
    details: i.details,
    resolvedBy: i.resolvedBy,
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    resolutionNotes: i.resolutionNotes,
    createdAt: i.createdAt.toISOString(),
  };
}

export function adminReconciliationRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();

  // GET /admin/reconciliation/runs
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/reconciliation/runs',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: { query: ReconciliationRunListQuerySchema },
      responses: {
        200: {
          description: 'Reconciliation runs list',
          content: { 'application/json': { schema: ReconciliationRunListResponseSchema } },
        },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'reconciliation:read', {});
      const q = c.req.valid('query');
      const rows = await deps.store.reconciliation.listRuns({
        before: decodeCursor(q.cursor),
        limit: q.limit + 1,
      });
      const page = rows.slice(0, q.limit);
      const last = page[page.length - 1];
      return c.json(
        {
          runs: page.map(serializeRun),
          nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
        },
        200,
      );
    },
  );

  // GET /admin/reconciliation/runs/{id}
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/reconciliation/runs/{id}',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: { params: z.object({ id: z.uuid() }) },
      responses: {
        200: {
          description: 'Reconciliation run details',
          content: { 'application/json': { schema: ReconciliationRunSchema } },
        },
        404: { description: 'Run not found' },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'reconciliation:read', {});
      const { id } = c.req.valid('param');
      const run = await deps.store.reconciliation.findRunById(id);
      if (!run) throw new ApiError('NOT_FOUND', 'Reconciliation run not found');
      return c.json(serializeRun(run), 200);
    },
  );

  // GET /admin/reconciliation/runs/{id}/items
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/reconciliation/runs/{id}/items',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: {
        params: z.object({ id: z.uuid() }),
        query: ReconciliationItemListQuerySchema,
      },
      responses: {
        200: {
          description: 'Reconciliation items for run',
          content: { 'application/json': { schema: ReconciliationItemListResponseSchema } },
        },
        404: { description: 'Run not found' },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'reconciliation:read', {});
      const { id } = c.req.valid('param');
      const run = await deps.store.reconciliation.findRunById(id);
      if (!run) throw new ApiError('NOT_FOUND', 'Reconciliation run not found');

      const q = c.req.valid('query');
      const rows = await deps.store.reconciliation.listItems({
        runId: id,
        result: q.result,
        unresolvedOnly: q.unresolvedOnly,
        before: decodeCursor(q.cursor),
        limit: q.limit + 1,
      });
      const page = rows.slice(0, q.limit);
      const last = page[page.length - 1];
      return c.json(
        {
          items: page.map(serializeItem),
          nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
        },
        200,
      );
    },
  );

  // POST /admin/reconciliation/items/{id}/resolve
  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/reconciliation/items/{id}/resolve',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: {
        params: z.object({ id: z.uuid() }),
        body: {
          content: { 'application/json': { schema: ResolveReconciliationItemRequestSchema } },
        },
      },
      responses: {
        200: {
          description: 'Resolved reconciliation item',
          content: { 'application/json': { schema: ReconciliationItemSchema } },
        },
        404: { description: 'Item not found' },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'reconciliation:resolve', {});
      const actor = c.get('actor');
      const { id } = c.req.valid('param');
      const req = c.req.valid('json');

      const item = await deps.store.reconciliation.findItem(id);
      if (!item) throw new ApiError('NOT_FOUND', 'Reconciliation item not found');
      if (item.resolvedAt)
        throw new ApiError('INVALID_STATE_TRANSITION', 'This exception was already resolved');

      const resolved = await deps.store.reconciliation.resolveItem(id, {
        resolvedBy: actor.userId,
        resolvedAt: deps.now(),
        notes: req.notes,
      });
      // Someone resolved it a moment ago.
      if (!resolved)
        throw new ApiError('INVALID_STATE_TRANSITION', 'This exception was already resolved');

      await audit(c, deps, {
        action: 'reconciliation.item_resolved',
        entityType: 'reconciliation_item',
        entityId: id,
        after: { notes: req.notes, previousResult: item.result },
      });

      return c.json(serializeItem(resolved), 200);
    },
  );

  return app;
}
