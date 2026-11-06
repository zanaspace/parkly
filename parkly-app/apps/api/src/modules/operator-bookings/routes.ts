import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  OPERATOR_BOOKINGS_EXPORT_MAX_ROWS,
  OPERATOR_BOOKINGS_MAX_DAYS,
  OperatorBookingListQuerySchema,
  OperatorBookingListSchema,
  OperatorBookingQuerySchema,
  type OperatorBooking,
  type OperatorBookingQuery,
} from '@parkly/contracts';
import type { BookingStatus } from '@parkly/domain/booking';
import { toCsv } from '@parkly/domain/operator';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import type { OperatorBookingFilter, OperatorBookingRow } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const DAY_MS = 24 * 60 * 60_000;

/** Without a status filter: real bookings only, not abandoned checkouts. */
const DEFAULT_STATUSES: BookingStatus[] = [
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

/** Lagos dates (both included) to a UTC window, at most 93 days. */
function window(q: OperatorBookingQuery): { from: Date; to: Date } {
  let from: Date;
  let to: Date;
  try {
    from = lagosDayStart(q.from);
    to = new Date(lagosDayStart(q.to).getTime() + DAY_MS);
  } catch {
    throw new ApiError('REPORT_RANGE_INVALID', 'Use real dates as YYYY-MM-DD.');
  }
  const days = (to.getTime() - from.getTime()) / DAY_MS;
  if (days < 1 || days > OPERATOR_BOOKINGS_MAX_DAYS)
    throw new ApiError(
      'REPORT_RANGE_INVALID',
      `Choose a "from" date on or before "to", at most ${OPERATOR_BOOKINGS_MAX_DAYS} days apart.`,
    );
  return { from, to };
}

const encodeCursor = (r: { startAt: Date; id: string }) =>
  Buffer.from(`${r.startAt.toISOString()}|${r.id}`).toString('base64url');

function decodeCursor(cursor: string): { startAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const startAt = new Date(iso ?? '');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(startAt.getTime()))
    throw new ApiError('VALIDATION_FAILED', 'That page link is no longer valid.', {
      errors: [{ path: 'cursor', message: 'Invalid cursor' }],
    });
  return { startAt, id };
}

const toItem = (r: OperatorBookingRow): OperatorBooking => ({
  id: r.id,
  code: r.code,
  lotId: r.lotId,
  lotName: r.lotName,
  status: r.status,
  product: r.product,
  startAt: r.startAt.toISOString(),
  endAt: r.endAt.toISOString(),
  plate: r.plateNorm,
  driverFirstName: r.driverFirstName,
  priceKobo: r.priceKobo,
  totalKobo: r.totalKobo,
  checkInAt: r.checkInAt?.toISOString() ?? null,
  checkOutAt: r.checkOutAt?.toISOString() ?? null,
  overstayStatus: r.overstayStatus,
  overstayAmountKobo: r.overstayAmountKobo,
  autoClosed: r.sessionFlags.includes('AUTO_CLOSED'),
});

/** Kobo as naira with two decimals, without floating point (Never-do #10). */
const naira = (kobo: number) =>
  `${kobo < 0 ? '-' : ''}${Math.trunc(Math.abs(kobo) / 100)}.${String(Math.abs(kobo) % 100).padStart(2, '0')}`;

/** "2026-11-06 14:30" in Lagos (UTC+1). */
const lagosTime = (d: Date | null) =>
  d ? new Date(d.getTime() + 60 * 60_000).toISOString().slice(0, 16).replace('T', ' ') : null;

const CSV_HEADER = [
  'booking_code',
  'car_park',
  'status',
  'product',
  'start_lagos',
  'end_lagos',
  'plate',
  'driver_first_name',
  'price_ngn',
  'total_paid_ngn',
  'checked_in_lagos',
  'checked_out_lagos',
  'auto_closed',
  'overstay_status',
  'overstay_ngn',
];

/**
 * FR-OPS-002: an operator's bookings, filtered by lot, Lagos dates and status,
 * and the CSV export (owner and managers; every export audited and stamped with
 * who exported it, doc 20 S7 task 2). Drivers appear by first name and plate only.
 */
export function operatorBookingRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };
  const params = z.object({ operatorId: z.uuid() });

  const filterFor = (
    operatorId: string,
    q: OperatorBookingQuery,
    limit: number,
    after?: OperatorBookingFilter['after'],
  ): OperatorBookingFilter => ({
    operatorId,
    ...window(q),
    ...(q.lotId ? { lotId: q.lotId } : {}),
    statuses: q.status?.length ? q.status : DEFAULT_STATUSES,
    ...(after ? { after } : {}),
    limit,
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/bookings',
      tags: ['operators'],
      ...secured,
      request: { params, query: OperatorBookingListQuerySchema },
      responses: {
        200: { description: 'One page of bookings', ...json(OperatorBookingListSchema) },
      },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:bookings:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const q = c.req.valid('query');
      const after = q.cursor ? decodeCursor(q.cursor) : undefined;
      const rows = await deps.store.attend.operatorBookings(
        filterFor(operatorId, q, q.limit + 1, after),
      );
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return c.json(
        {
          items: page.map(toItem),
          nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/bookings/export',
      tags: ['operators'],
      ...secured,
      request: { params, query: OperatorBookingQuerySchema },
      responses: {
        200: {
          description: 'Bookings as CSV, stamped with who exported them',
          content: { 'text/csv': { schema: z.string() } },
        },
      },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(
        c,
        deps.logger,
        'operator:bookings:export',
        { operatorId },
        { denyAs: 'NOT_FOUND' },
      );
      const q = c.req.valid('query');
      const rows = await deps.store.attend.operatorBookings(
        filterFor(operatorId, q, OPERATOR_BOOKINGS_EXPORT_MAX_ROWS + 1),
      );
      if (rows.length > OPERATOR_BOOKINGS_EXPORT_MAX_ROWS)
        throw new ApiError(
          'EXPORT_TOO_LARGE',
          `More than ${OPERATOR_BOOKINGS_EXPORT_MAX_ROWS} bookings match. Choose fewer days or one car park.`,
        );

      const actor = c.get('actor');
      const now = deps.now();
      const statuses = q.status?.length ? q.status : DEFAULT_STATUSES;
      const filters = { from: q.from, to: q.to, lotId: q.lotId ?? null, statuses };
      const csv = toCsv([
        // The watermark: who exported this and when (doc 20 S7 task 2).
        [
          'Parkly bookings export',
          `Exported by user ${actor.userId}`,
          `At ${lagosTime(now)} Lagos`,
          `Dates ${q.from} to ${q.to}`,
          `Car park ${q.lotId ?? 'all'}`,
          `Status ${statuses.join('|')}`,
        ],
        [],
        CSV_HEADER,
        ...rows.map((r) => [
          r.code,
          r.lotName,
          r.status,
          r.product,
          lagosTime(r.startAt),
          lagosTime(r.endAt),
          r.plateNorm,
          r.driverFirstName,
          naira(r.priceKobo),
          naira(r.totalKobo),
          lagosTime(r.checkInAt),
          lagosTime(r.checkOutAt),
          r.sessionFlags.includes('AUTO_CLOSED') ? 'yes' : 'no',
          r.overstayStatus,
          naira(r.overstayAmountKobo),
        ]),
      ]);

      await audit(c, deps, {
        action: 'operator.bookings_exported',
        entityType: 'operator',
        entityId: operatorId,
        after: { ...filters, rows: rows.length },
      });

      return c.body(csv, 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="parkly-bookings-${q.from}-to-${q.to}-${lagosDateKey(now)}.csv"`,
        'cache-control': 'no-store',
      });
    },
  );

  return app;
}
