import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CorporateFleetDriverSchema,
  CorporateTenantResponseSchema,
  CreateCorporateTenantRequestSchema,
  CreateFleetDriverRequestSchema,
  DriverJoinRequestSchema,
  DriverJoinResponseSchema,
  ResolveCorporateDomainResponseSchema,
  UpdateCorporateProfileRequestSchema,
  UpdateFleetDriverStatusRequestSchema,
} from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { ApiError } from '../../lib/errors.js';
import type { CorporateAccountRow } from '../../store/types.js';
import {
  DomainQuery,
  DriverParam,
  formatTenant,
  json,
  serializeDriver,
  SlugParam,
} from './helpers.js';

export function corporateRoutes(deps: AppDeps) {
  const app = new OpenAPIHono();

  /** Resolves corporate subdomain or custom domain for Edge Middleware */
  app.openapi(
    createRoute({
      method: 'get',
      path: '/corp/resolve',
      tags: ['corporate'],
      summary: 'Resolve corporate subdomain or custom domain',
      request: { query: DomainQuery },
      responses: {
        200: {
          description: 'Resolved corporate domain mapping',
          ...json(ResolveCorporateDomainResponseSchema),
        },
      },
    }),
    async (c) => {
      const { domain } = c.req.valid('query');
      const normalized = domain.toLowerCase().trim();
      const tenant =
        (await deps.store.corporate.findBySubdomain(normalized)) ||
        (await deps.store.corporate.findByDomain(normalized));

      if (!tenant) throw new ApiError('NOT_FOUND', `Domain '${domain}' is not registered`);

      const matching =
        tenant.domains.find(
          (d) =>
            d.subdomain.toLowerCase() === normalized ||
            d.customDomain?.toLowerCase() === normalized,
        ) ?? tenant.domains[0];

      return c.json(
        {
          corporateId: tenant.account.id,
          slug: tenant.account.slug,
          subdomain: matching ? matching.subdomain : tenant.account.slug,
          customDomain: matching ? matching.customDomain : null,
          isVerified: matching ? matching.isVerified : false,
          legalName: tenant.account.legalName,
        },
        200,
      );
    },
  );

  /** Onboards a new corporate tenant */
  app.openapi(
    createRoute({
      method: 'post',
      path: '/corp/onboard',
      tags: ['corporate'],
      summary: 'Register and onboard a new corporate tenant',
      request: { body: json(CreateCorporateTenantRequestSchema) },
      responses: {
        201: {
          description: 'Corporate tenant created successfully',
          ...json(CorporateTenantResponseSchema),
        },
      },
    }),
    async (c) => {
      const input = c.req.valid('json');
      const normalizedSlug = input.slug.toLowerCase().trim();
      const existing = await deps.store.corporate.findBySlug(normalizedSlug);
      if (existing) throw new ApiError('SLUG_TAKEN', `Subdomain '${normalizedSlug}' is taken`);

      const account = await deps.store.corporate.createAccount({
        slug: normalizedSlug,
        legalName: input.legalName.trim(),
        cacRcNumber: input.cacRcNumber.trim(),
        industry: input.industry.trim(),
        headOfficeAddress: input.headOfficeAddress.trim(),
        primaryContactName: input.primaryContactName.trim(),
        primaryContactEmail: input.primaryContactEmail.toLowerCase().trim(),
        primaryContactPhone: input.primaryContactPhone.trim(),
      });

      const branding = await deps.store.corporate.setBranding(account.id, {
        logoUrl: input.branding.logoUrl || `https://avatar.vercel.sh/${normalizedSlug}.png`,
        primaryColor: input.branding.primaryColor || '#E31837',
        secondaryColor: input.branding.secondaryColor || '#1E1E1E',
        portalTitle: input.branding.portalTitle.trim(),
        welcomeMessage: input.branding.welcomeMessage?.trim() ?? null,
      });

      const domain = await deps.store.corporate.addDomain(account.id, {
        subdomain: normalizedSlug,
        emailDomain: input.emailDomain.toLowerCase().replace(/^@/, '').trim(),
        isVerified: false,
      });

      return c.json(formatTenant(account, branding, [domain.emailDomain]), 201);
    },
  );

  /** Driver join route with phone number and join code (no SMS OTP required) */
  app.openapi(
    createRoute({
      method: 'post',
      path: '/corp/drivers/join',
      tags: ['corporate'],
      summary: 'Driver joins corporate roster using join code and phone number',
      request: { body: json(DriverJoinRequestSchema) },
      responses: {
        200: {
          description: 'Driver successfully validated and pending approval',
          ...json(DriverJoinResponseSchema),
        },
      },
    }),
    async (c) => {
      const input = c.req.valid('json');
      const driver = await deps.store.corporate.findFleetDriverByCode(input.joinCode.trim());
      if (!driver) throw new ApiError('NOT_FOUND', 'Invalid join code. Contact your fleet admin.');

      const cleanNum = (num: string) => num.replace(/[\s\-()+]/g, '');
      if (cleanNum(driver.phone) !== cleanNum(input.phone)) {
        throw new ApiError('FORBIDDEN', 'Phone number does not match this invitation code');
      }

      return c.json(
        {
          success: true,
          message: 'Join code verified. Your profile is pending corporate admin approval.',
          driver: serializeDriver(driver),
          corporate: {
            id: driver.corporate.id,
            slug: driver.corporate.slug,
            legalName: driver.corporate.legalName,
          },
        },
        200,
      );
    },
  );

  /** Public corporate tenant discovery metadata */
  app.openapi(
    createRoute({
      method: 'get',
      path: '/corp/{slug}',
      tags: ['corporate'],
      summary: 'Get public corporate tenant metadata',
      request: { params: SlugParam },
      responses: {
        200: {
          description: 'Corporate tenant details',
          ...json(CorporateTenantResponseSchema),
        },
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const tenant = await deps.store.corporate.findBySlug(slug);
      if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

      return c.json(
        formatTenant(
          tenant.account,
          tenant.branding,
          tenant.domains.map((d) => d.emailDomain),
        ),
        200,
      );
    },
  );

  /** Update corporate tenant details & branding */
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/corp/{slug}',
      tags: ['corporate'],
      summary: 'Update corporate tenant profile and branding',
      request: {
        params: SlugParam,
        body: { ...json(UpdateCorporateProfileRequestSchema), required: true },
      },
      responses: {
        200: {
          description: 'Corporate tenant updated successfully',
          ...json(CorporateTenantResponseSchema),
        },
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const input = c.req.valid('json');
      const tenant = await deps.store.corporate.findBySlug(slug);
      if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

      let account = tenant.account;
      const updates: Partial<CorporateAccountRow> = {};
      if (input.legalName) updates.legalName = input.legalName.trim();
      if (input.cacRcNumber) updates.cacRcNumber = input.cacRcNumber.trim();
      if (input.industry) updates.industry = input.industry.trim();
      if (input.headOfficeAddress) updates.headOfficeAddress = input.headOfficeAddress.trim();
      if (input.primaryContactName) updates.primaryContactName = input.primaryContactName.trim();
      if (input.primaryContactEmail)
        updates.primaryContactEmail = input.primaryContactEmail.toLowerCase().trim();
      if (input.primaryContactPhone) updates.primaryContactPhone = input.primaryContactPhone.trim();

      if (Object.keys(updates).length > 0) {
        account = await deps.store.corporate.updateAccount(tenant.account.id, updates);
      }

      let branding = tenant.branding;
      if (input.branding) {
        branding = await deps.store.corporate.updateBranding(tenant.account.id, {
          ...(input.branding.logoUrl && { logoUrl: input.branding.logoUrl }),
          ...(input.branding.primaryColor && { primaryColor: input.branding.primaryColor }),
          ...(input.branding.secondaryColor && { secondaryColor: input.branding.secondaryColor }),
          ...(input.branding.portalTitle && { portalTitle: input.branding.portalTitle.trim() }),
          ...(input.branding.welcomeMessage !== undefined && {
            welcomeMessage: input.branding.welcomeMessage,
          }),
        });
      }

      let emailDomains = tenant.domains.map((d) => d.emailDomain);
      if (input.emailDomain) {
        const normalizedDomain = input.emailDomain.toLowerCase().trim();
        const updatedDomain = await deps.store.corporate.updateEmailDomain(
          tenant.account.id,
          normalizedDomain,
        );
        if (updatedDomain) {
          emailDomains = [updatedDomain.emailDomain];
        }
      }

      return c.json(formatTenant(account, branding, emailDomains), 200);
    },
  );

  /** List field drivers */
  app.openapi(
    createRoute({
      method: 'get',
      path: '/corp/{slug}/drivers',
      tags: ['corporate'],
      summary: 'List corporate fleet and field drivers',
      request: { params: SlugParam },
      responses: {
        200: {
          description: 'List of fleet drivers',
          ...json(z.array(CorporateFleetDriverSchema)),
        },
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const tenant = await deps.store.corporate.findBySlug(slug);
      if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

      const drivers = await deps.store.corporate.listFleetDrivers(tenant.account.id);
      return c.json(drivers.map(serializeDriver), 200);
    },
  );

  /** Add field driver and generate unique Join Code */
  app.openapi(
    createRoute({
      method: 'post',
      path: '/corp/{slug}/drivers',
      tags: ['corporate'],
      summary: 'Add field driver and generate join code',
      request: {
        params: SlugParam,
        body: { ...json(CreateFleetDriverRequestSchema), required: true },
      },
      responses: {
        201: {
          description: 'Field driver added with join code',
          ...json(CorporateFleetDriverSchema),
        },
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const input = c.req.valid('json');
      const tenant = await deps.store.corporate.findBySlug(slug);
      if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

      const prefix = slug.slice(0, 3).toUpperCase();
      const joinCode = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

      const driver = await deps.store.corporate.createFleetDriver({
        corporateId: tenant.account.id,
        driverName: input.driverName.trim(),
        phone: input.phone.trim(),
        vehiclePlate: input.vehiclePlate?.toUpperCase().trim() || null,
        joinCode,
      });

      return c.json(serializeDriver(driver), 201);
    },
  );

  /** Update driver approval status */
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/corp/{slug}/drivers/{driverId}/status',
      tags: ['corporate'],
      summary: 'Update driver approval status',
      request: {
        params: DriverParam,
        body: { ...json(UpdateFleetDriverStatusRequestSchema), required: true },
      },
      responses: {
        200: {
          description: 'Driver status updated',
          ...json(CorporateFleetDriverSchema),
        },
      },
    }),
    async (c) => {
      const { slug, driverId } = c.req.valid('param');
      const input = c.req.valid('json');
      const tenant = await deps.store.corporate.findBySlug(slug);
      if (!tenant) throw new ApiError('NOT_FOUND', `Corporate tenant '${slug}' not found`);

      const driver = await deps.store.corporate.updateFleetDriverStatus(
        driverId,
        input.approvalStatus,
      );
      return c.json(serializeDriver(driver), 200);
    },
  );

  return app;
}
