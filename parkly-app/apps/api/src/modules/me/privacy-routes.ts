import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CancelDeletionResponseSchema,
  DataExportDownloadSchema,
  DataExportResponseSchema,
} from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { DsrAlreadyOpenError } from '../../store/types.js';
import { buildDataExport } from './data-export.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const IdParam = z.object({ id: z.uuid() });
const DSR_DUE_DAYS = 30; // NDPA response window (doc 06 section 11)
const DOWNLOAD_LINK_SEC = 15 * 60;

/**
 * NDPA rights a driver can use themselves (doc 06 sections 6.1 and 11):
 * - Ask for a copy of their data, and download it with a short-lived link. The file
 *   is deleted after 7 days by the retention job.
 * - Change their mind about closing the account while the 30 days run.
 */
export function privacyRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  app.openapi(
    createRoute({
      method: 'post',
      path: '/me/data-export',
      tags: ['me'],
      ...secured,
      responses: { 201: { description: 'Export ready', ...json(DataExportResponseSchema) } },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'account:export:own', { ownerUserId: actor.userId });
      const now = deps.now();
      let request: { id: string };
      try {
        request = await deps.store.dataRequests.createAccess(
          actor.userId,
          new Date(now.getTime() + DSR_DUE_DAYS * 86_400_000),
        );
      } catch (err) {
        if (err instanceof DsrAlreadyOpenError) throw new ApiError('DSR_ALREADY_OPEN');
        throw err;
      }
      const data = await buildDataExport(deps, actor.userId);
      const path = `${actor.userId}/${request.id}.json`;
      await deps.storage.upload({
        bucket: 'exports',
        path,
        body: new TextEncoder().encode(JSON.stringify(data, null, 2)),
        contentType: 'application/json',
      });
      await deps.store.dataRequests.complete(request.id, deps.now(), path);
      await audit(c, deps, {
        action: 'user.data_export_created',
        entityType: 'data_request',
        entityId: request.id,
      });
      return c.json({ requestId: request.id, status: 'COMPLETED' as const }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me/data-export/{id}',
      tags: ['me'],
      ...secured,
      request: { params: IdParam },
      responses: { 200: { description: 'Download link', ...json(DataExportDownloadSchema) } },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'account:export:own', { ownerUserId: actor.userId });
      const request = await deps.store.dataRequests.find(c.req.valid('param').id);
      // Someone else's request looks the same as none.
      if (
        !request ||
        request.userId !== actor.userId ||
        request.type !== 'ACCESS' ||
        !request.exportStoragePath
      )
        throw new ApiError('NOT_FOUND', 'No export to download. It may have expired; ask again.');
      const url = await deps.storage.createSignedDownloadUrl({
        bucket: 'exports',
        path: request.exportStoragePath,
        expiresInSec: DOWNLOAD_LINK_SEC,
      });
      await audit(c, deps, {
        action: 'user.data_export_downloaded',
        entityType: 'data_request',
        entityId: request.id,
      });
      return c.json({ url, expiresInSeconds: DOWNLOAD_LINK_SEC }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/me/deletion/cancel',
      tags: ['me'],
      ...secured,
      responses: { 200: { description: 'Account kept', ...json(CancelDeletionResponseSchema) } },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'account:delete:own', { ownerUserId: actor.userId });
      const cancelled = await deps.store.dataRequests.cancelDeletion(actor.userId, deps.now());
      if (!cancelled)
        throw new ApiError('INVALID_STATE_TRANSITION', 'There is no account closure to cancel');
      await deps.store.users.setStatus(actor.userId, 'ACTIVE');
      await audit(c, deps, {
        action: 'user.deletion_cancelled',
        entityType: 'user',
        entityId: actor.userId,
      });
      return c.json({ status: 'ACTIVE' as const }, 200);
    },
  );

  return app;
}
