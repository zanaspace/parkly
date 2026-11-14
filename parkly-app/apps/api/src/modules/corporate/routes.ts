import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CorporateTenantResponseSchema,
  CreateCorporateTenantRequestSchema,
  ResolveCorporateDomainResponseSchema,
} from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { ApiError } from '../../lib/errors.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const SlugParam = z.object({ slug: z.string().min(1).max(64) });
const DomainQuery = z.object({ domain: z.string().min(1) });

export function corporateRoutes(deps: AppDeps) {
  const app = new OpenAPIHono();

  /**
   * Resolves a subdomain or custom domain for Edge Middleware routing.
   * Registered first so it doesn't get captured by :slug.
   */
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

      // Check if domain is a direct subdomain or a custom CNAME domain
      let tenant = await deps.store.corporate.findBySubdomain(normalized);
      if (!tenant) {
        tenant = await deps.store.corporate.findByDomain(normalized);
      }

      if (!tenant) throw new ApiError('NOT_FOUND', `Domain '${domain}' is not registered`);

      const matchingDomain =
        tenant.domains.find(
          (d) =>
            d.subdomain.toLowerCase() === normalized ||
            d.customDomain?.toLowerCase() === normalized,
        ) ?? tenant.domains[0];

      return c.json(
        {
          corporateId: tenant.account.id,
          slug: tenant.account.slug,
          subdomain: matchingDomain ? matchingDomain.subdomain : tenant.account.slug,
          customDomain: matchingDomain ? matchingDomain.customDomain : null,
          isVerified: matchingDomain ? matchingDomain.isVerified : false,
          legalName: tenant.account.legalName,
        },
        200,
      );
    },
  );

  /**
   * Self-serve onboarding for new corporate enterprise accounts.
   */
  app.openapi(
    createRoute({
      method: 'post',
      path: '/corp/onboard',
      tags: ['corporate'],
      summary: 'Register and onboard a new corporate tenant',
      request: {
        body: json(CreateCorporateTenantRequestSchema),
      },
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
      if (existing) {
        throw new ApiError('SLUG_TAKEN', `Subdomain '${normalizedSlug}' is already taken`);
      }

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

      return c.json(
        {
          id: account.id,
          slug: account.slug,
          legalName: account.legalName,
          industry: account.industry,
          billingTier: account.billingTier,
          branding: {
            logoUrl: branding.logoUrl,
            primaryColor: branding.primaryColor,
            secondaryColor: branding.secondaryColor,
            portalTitle: branding.portalTitle,
            welcomeMessage: branding.welcomeMessage,
          },
          emailDomains: [domain.emailDomain],
        },
        201,
      );
    },
  );

  /**
   * Public tenant discovery for corporate subdomains (e.g. zenith.parkly.ng).
   * Returns branding, logo, colors, and verified email domains.
   */
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
        {
          id: tenant.account.id,
          slug: tenant.account.slug,
          legalName: tenant.account.legalName,
          industry: tenant.account.industry,
          billingTier: tenant.account.billingTier,
          branding: tenant.branding
            ? {
                logoUrl: tenant.branding.logoUrl,
                primaryColor: tenant.branding.primaryColor,
                secondaryColor: tenant.branding.secondaryColor,
                portalTitle: tenant.branding.portalTitle,
                welcomeMessage: tenant.branding.welcomeMessage,
              }
            : null,
          emailDomains: tenant.domains.map((d) => d.emailDomain),
        },
        200,
      );
    },
  );

  return app;
}
