import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  LagosMonthSchema,
  MonthlyStatementQuerySchema,
  MonthlyStatementSchema,
  OPERATOR_REPORT_MAX_DAYS,
  OperatorEarningsQuerySchema,
  OperatorEarningsReportSchema,
  PlatformEarningsQuerySchema,
  PlatformEarningsReportSchema,
} from '@parkly/contracts';
import { earningsToCsv } from '@parkly/domain/operator';
import { lagosDateKey, lagosDayStart } from '@parkly/domain/time';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { renderStatementPdf } from './statement-pdf.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const DAY_MS = 24 * 60 * 60_000;

function validateWindow(q: { from: string; to: string }): void {
  let from: Date;
  let to: Date;
  try {
    from = lagosDayStart(q.from);
    to = new Date(lagosDayStart(q.to).getTime() + DAY_MS);
  } catch {
    throw new ApiError('REPORT_RANGE_INVALID', 'Use real dates as YYYY-MM-DD.');
  }
  const days = (to.getTime() - from.getTime()) / DAY_MS;
  if (days < 1 || days > OPERATOR_REPORT_MAX_DAYS) {
    throw new ApiError(
      'REPORT_RANGE_INVALID',
      `Choose a "from" date on or before "to", at most ${OPERATOR_REPORT_MAX_DAYS} days apart.`,
    );
  }
}

/**
 * FR-OPS-003: Revenue and settlement reports per operator, lot, and day.
 * FR-OPS-006: Monthly statement of account and PDF download.
 */
export function reportRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };
  const operatorParam = z.object({ operatorId: z.uuid() });
  const statementParam = z.object({ operatorId: z.uuid(), month: LagosMonthSchema });

  // 1. GET /operators/{operatorId}/reports/earnings
  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/reports/earnings',
      tags: ['operators'],
      ...secured,
      request: { params: operatorParam, query: OperatorEarningsQuerySchema },
      responses: {
        200: {
          description: 'Operator revenue and settlement report',
          ...json(OperatorEarningsReportSchema),
        },
      },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:reports:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const q = c.req.valid('query');
      validateWindow(q);

      const report = await deps.store.reports.operatorEarnings({
        operatorId,
        from: q.from,
        to: q.to,
        lotId: q.lotId,
      });

      return c.json(report, 200);
    },
  );

  // 2. GET /operators/{operatorId}/reports/export
  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/reports/export',
      tags: ['operators'],
      ...secured,
      request: { params: operatorParam, query: OperatorEarningsQuerySchema },
      responses: {
        200: {
          description: 'Revenue report as watermarked CSV',
          content: { 'text/csv': { schema: z.string() } },
        },
      },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:reports:export', { operatorId }, { denyAs: 'NOT_FOUND' });
      const q = c.req.valid('query');
      validateWindow(q);

      const report = await deps.store.reports.operatorEarnings({
        operatorId,
        from: q.from,
        to: q.to,
        lotId: q.lotId,
      });

      let lotName: string | null = null;
      if (q.lotId) {
        const lot = await deps.store.lots.find(operatorId, q.lotId);
        lotName = lot?.name ?? null;
      }

      const actor = c.get('actor');
      const now = deps.now();

      const csv = earningsToCsv(report, {
        userId: actor.userId,
        exportedAt: now,
        lotName,
      });

      await audit(c, deps, {
        action: 'operator.earnings_exported',
        entityType: 'operator',
        entityId: operatorId,
        after: { from: q.from, to: q.to, lotId: q.lotId ?? null, days: report.daily.length },
      });

      return c.body(csv, 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="parkly-revenue-${q.from}-to-${q.to}-${lagosDateKey(now)}.csv"`,
        'cache-control': 'no-store',
      });
    },
  );

  // 3. GET /operators/{operatorId}/reports/statements/{month}
  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/reports/statements/{month}',
      tags: ['operators'],
      ...secured,
      request: { params: statementParam, query: MonthlyStatementQuerySchema },
      responses: {
        200: {
          description: 'Monthly statement in JSON or PDF format',
          content: {
            'application/json': { schema: MonthlyStatementSchema },
            'application/pdf': { schema: z.string() },
          },
        },
      },
    }),
    async (c) => {
      const { operatorId, month } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:reports:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const { format } = c.req.valid('query');

      const statement = await deps.store.reports.monthlyStatement({
        operatorId,
        month,
      });

      if (!statement) {
        throw new ApiError('NOT_FOUND', 'Operator not found');
      }

      if (format === 'pdf') {
        const pdfBytes = await renderStatementPdf(statement);

        await audit(c, deps, {
          action: 'operator.statement_downloaded',
          entityType: 'operator',
          entityId: operatorId,
          after: { statementNumber: statement.statementNumber, month },
        });

        return c.body(Buffer.from(pdfBytes), 200, {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="parkly-statement-${statement.statementNumber}.pdf"`,
          'cache-control': 'no-store',
        });
      }

      return c.json(statement, 200);
    },
  );

  // 4. GET /admin/reports/platform-earnings: Parkly's own revenue across operators.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/reports/platform-earnings',
      tags: ['admin'],
      ...secured,
      request: { query: PlatformEarningsQuerySchema },
      responses: {
        200: {
          description:
            'Platform revenue: commission, service fees and Paystack fees, by day and operator',
          ...json(PlatformEarningsReportSchema),
        },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'platform:revenue:read', {});
      const q = c.req.valid('query');
      validateWindow(q);
      return c.json(await deps.store.reports.platformEarnings(q), 200);
    },
  );

  return app;
}
