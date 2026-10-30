import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AdminBookingSchema,
  AuditLogPageSchema,
  AuditLogQuerySchema,
  WaiveOverstayRequestSchema,
} from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
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

  // FR-AUTH-006: end every session a user has (lost phone, compromised account).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/users/{userId}/sessions/revoke',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
      request: { params: z.object({ userId: z.uuid() }) },
      responses: { 204: { description: 'Sessions revoked' } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'user:sessions:revoke', {});
      const { userId } = c.req.valid('param');
      if (!(await deps.store.users.find(userId))) throw new ApiError('NOT_FOUND');
      await deps.store.sessions.revokeAll(userId);
      await deps.store.devices.revokeAll(userId);
      await audit(c, deps, {
        action: 'user.sessions_revoked',
        entityType: 'user',
        entityId: userId,
      });
      return c.body(null, 204);
    },
  );

  const adminAuth = [authenticate(deps.verifyToken), loadActor(deps.store)];
  const adminBooking = async (id: string) => {
    const booking = await deps.store.bookings.find(id);
    if (!booking) throw new ApiError('NOT_FOUND');
    const [lot, session] = await Promise.all([
      deps.store.lots.findById(booking.lotId),
      deps.store.attend.sessionByBooking(booking.id),
    ]);
    return {
      id: booking.id,
      code: booking.code,
      status: booking.status,
      lotName: lot?.name ?? '',
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      overstay: session
        ? {
            status: session.overstayStatus,
            minutes: session.overstayMinutes,
            amountKobo: session.overstayAmountKobo,
          }
        : null,
    };
  };

  // Support finds a booking by its code to see the overstay (gap review L-4).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/bookings/by-code/{code}',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: adminAuth,
      request: { params: z.object({ code: z.string().regex(/^PK-[A-Z0-9]{6}$/) }) },
      responses: {
        200: {
          description: 'Booking',
          content: { 'application/json': { schema: AdminBookingSchema } },
        },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'booking:support:read', {});
      const booking = await deps.store.bookings.findByCode(c.req.valid('param').code);
      if (!booking) throw new ApiError('NOT_FOUND');
      return c.json(await adminBooking(booking.id), 200);
    },
  );

  // FR-BOOK-008: ops waive an overstay as goodwill, with a reason in the audit log.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/bookings/{id}/overstay/waive',
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      middleware: adminAuth,
      request: {
        params: z.object({ id: z.uuid() }),
        body: {
          content: { 'application/json': { schema: WaiveOverstayRequestSchema } },
          required: true,
        },
      },
      responses: {
        200: {
          description: 'Waived',
          content: { 'application/json': { schema: AdminBookingSchema } },
        },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'overstay:waive', {});
      const { id } = c.req.valid('param');
      const { reason } = c.req.valid('json');
      const before = await adminBooking(id);
      if (!(await deps.store.attend.waiveOverstay(id, deps.now())))
        throw new ApiError('OVERSTAY_NOT_DUE', 'There is no unpaid overstay on this booking');
      await audit(c, deps, {
        action: 'overstay.waived',
        entityType: 'booking',
        entityId: id,
        before: { status: before.overstay?.status },
        after: { reason, amountKobo: before.overstay?.amountKobo ?? 0 },
      });
      return c.json(await adminBooking(id), 200);
    },
  );

  return app;
}
