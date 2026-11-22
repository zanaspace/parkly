import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppDeps } from '../../app.js';
import type { AuthEnv } from '../../auth/context.js';
import { ApiError } from '../../lib/errors.js';
import { CorporateBookingItemSchema, CorporateFinanceSummarySchema } from '@parkly/contracts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

export const ListCorporateBookingsRoute = createRoute({
  method: 'get',
  path: '/corp/{slug}/bookings',
  tags: ['corporate'],
  summary: 'List itemized bookings for corporate tenant',
  request: {
    params: z.object({
      slug: z.string().min(1),
    }),
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
      offset: z.coerce.number().int().min(0).default(0).optional(),
      status: z.enum(['ACCRUED', 'INVOICED', 'PAID']).optional(),
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    }),
  },
  responses: {
    200: {
      description: 'Corporate bookings list',
      ...json(
        z.object({
          bookings: z.array(CorporateBookingItemSchema),
          total: z.number().int(),
        }),
      ),
    },
    404: {
      description: 'Tenant not found',
    },
  },
});

export const GetCorporateFinanceRoute = createRoute({
  method: 'get',
  path: '/corp/{slug}/finance',
  tags: ['corporate'],
  summary: 'Get consolidated corporate finance, charges, and VAT summary',
  request: {
    params: z.object({
      slug: z.string().min(1),
    }),
    query: z.object({
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    }),
  },
  responses: {
    200: {
      description: 'Consolidated finance summary',
      ...json(CorporateFinanceSummarySchema),
    },
    404: {
      description: 'Tenant not found',
    },
  },
});

export function corporateReportingRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();

  app.openapi(ListCorporateBookingsRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const { limit, offset, status, period } = c.req.valid('query');

    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) {
      throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);
    }

    const bookings = await deps.store.corporate.listBookings(tenant.account.id, {
      limit: limit ?? 50,
      offset: offset ?? 0,
      status,
      billingPeriod: period,
    });

    return c.json(
      {
        bookings,
        total: bookings.length,
      },
      200,
    );
  });

  app.openapi(GetCorporateFinanceRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const { period } = c.req.valid('query');

    const tenant = await deps.store.corporate.findBySlug(slug);
    if (!tenant) {
      throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);
    }

    const finance = await deps.store.corporate.getFinanceSummary(tenant.account.id, period);
    return c.json(finance, 200);
  });

  return app;
}
