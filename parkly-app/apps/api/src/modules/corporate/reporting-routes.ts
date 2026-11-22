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

const KNOWN_DEMO_TENANTS: Record<string, { legalName: string; email: string }> = {
  zenith: { legalName: 'Zenith Bank PLC', email: 'admin@zenithbank.com' },
  kpmg: { legalName: 'KPMG Nigeria', email: 'admin@kpmg.com' },
  dangote: { legalName: 'Dangote Industries Limited', email: 'admin@dangote.com' },
  sellyticshq: { legalName: 'Sellyticshq Inc', email: 'admin@sellyticshq.com' },
  sellytichq: { legalName: 'Sellyticshq Inc', email: 'admin@sellytichq.com' },
  cicod: { legalName: 'CICOD CRM', email: 'admin@cicod.com' },
  cicodcrm: { legalName: 'CICOD CRM', email: 'admin@cicod.com' },
};

async function resolveOrEnsureTenant(deps: AppDeps, slug: string) {
  const cleanSlug = slug.toLowerCase().trim();
  let tenant = await deps.store.corporate.findBySlug(cleanSlug);

  if (!tenant) {
    if (cleanSlug.includes('sellytichq') || cleanSlug.includes('sellyticshq')) {
      tenant =
        (await deps.store.corporate.findBySlug('sellytichq')) ??
        (await deps.store.corporate.findBySlug('sellyticshq'));
    } else if (cleanSlug.includes('cicod')) {
      tenant =
        (await deps.store.corporate.findBySlug('cicodcrm')) ??
        (await deps.store.corporate.findBySlug('cicod'));
    }
  }

  if (!tenant && KNOWN_DEMO_TENANTS[cleanSlug]) {
    const demo = KNOWN_DEMO_TENANTS[cleanSlug]!;
    const account = await deps.store.corporate.createAccount({
      slug: cleanSlug,
      legalName: demo.legalName,
      cacRcNumber: 'RC-CORP-AUTO',
      industry: 'Enterprise Mobility',
      headOfficeAddress: 'Victoria Island, Lagos, Nigeria',
      primaryContactName: 'Corporate Administrator',
      primaryContactEmail: demo.email,
      primaryContactPhone: '+2348000000000',
    });
    tenant = { account, branding: null, domains: [] };
  }

  return tenant;
}

export function corporateReportingRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();

  app.openapi(ListCorporateBookingsRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const { limit, offset, status, period } = c.req.valid('query');

    const tenant = await resolveOrEnsureTenant(deps, slug);
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

    const tenant = await resolveOrEnsureTenant(deps, slug);
    if (!tenant) {
      throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);
    }

    const finance = await deps.store.corporate.getFinanceSummary(tenant.account.id, period);
    return c.json(finance, 200);
  });

  return app;
}
