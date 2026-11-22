import { createRoute, z } from '@hono/zod-openapi';
import {
  CorporateDriverLoginRequestSchema,
  CorporateDriverLoginResponseSchema,
  CorporateFleetDriverSchema,
  CorporateTenantResponseSchema,
  CreateCorporateTenantRequestSchema,
  CreateFleetDriverRequestSchema,
  DriverJoinRequestSchema,
  DriverJoinResponseSchema,
  ResolveCorporateDomainResponseSchema,
  UpdateCorporateProfileRequestSchema,
  UpdateFleetDriverRequestSchema,
  UpdateFleetDriverStatusRequestSchema,
} from '@parkly/contracts';
import type {
  CorporateAccountRow,
  CorporateBrandingRow,
  CorporateFleetDriverRow,
} from '../../store/types.js';

export const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
export const SlugParam = z.object({ slug: z.string().min(1).max(64) });
export const DriverParam = z.object({
  slug: z.string().min(1).max(64),
  driverId: z.string().uuid(),
});
export const DomainQuery = z.object({ domain: z.string().min(1) });

export const ResolveTenantRoute = createRoute({
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
});

export const OnboardTenantRoute = createRoute({
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
});

export const DriverJoinRoute = createRoute({
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
});

export const DriverLoginRoute = createRoute({
  method: 'post',
  path: '/corp/drivers/login',
  tags: ['corporate'],
  summary: 'Authenticate corporate fleet driver with phone and join code without SMS OTP',
  request: { body: json(CorporateDriverLoginRequestSchema) },
  responses: {
    200: {
      description: 'Driver authenticated successfully',
      ...json(CorporateDriverLoginResponseSchema),
    },
  },
});

export const GetTenantRoute = createRoute({
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
});

export const UpdateTenantRoute = createRoute({
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
});

export const ListDriversRoute = createRoute({
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
});

export const CreateDriverRoute = createRoute({
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
});

export const DriverStatusRoute = createRoute({
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
});

export const DriverPatchRoute = createRoute({
  method: 'patch',
  path: '/corp/{slug}/drivers/{driverId}',
  tags: ['corporate'],
  summary: 'Update driver details and vehicle plate',
  request: {
    params: DriverParam,
    body: { ...json(UpdateFleetDriverRequestSchema), required: true },
  },
  responses: {
    200: {
      description: 'Driver updated',
      ...json(CorporateFleetDriverSchema),
    },
  },
});

export const SendWorkEmailOtpRequestSchema = z.object({
  email: z.string().email(),
});

export const SendWorkEmailOtpResponseSchema = z.object({
  success: z.boolean(),
  email: z.string(),
  company: z.string(),
  message: z.string(),
});

export const VerifyWorkEmailOtpRequestSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
});

export const VerifyWorkEmailOtpResponseSchema = z.object({
  success: z.boolean(),
  email: z.string(),
  company: z.string(),
  corporateId: z.string().optional(),
  subsidy: z.string(),
});

export const SendWorkEmailOtpRoute = createRoute({
  method: 'post',
  path: '/corp/work-email/send-otp',
  tags: ['corporate'],
  summary: 'Send 6-digit OTP to corporate work email for dual-profile linking',
  request: { body: json(SendWorkEmailOtpRequestSchema) },
  responses: {
    200: {
      description: 'OTP issued to corporate work email',
      ...json(SendWorkEmailOtpResponseSchema),
    },
  },
});

export const VerifyWorkEmailOtpRoute = createRoute({
  method: 'post',
  path: '/corp/work-email/verify-otp',
  tags: ['corporate'],
  summary: 'Verify 6-digit OTP and activate dual-profile corporate subsidy linking',
  request: { body: json(VerifyWorkEmailOtpRequestSchema) },
  responses: {
    200: {
      description: 'Corporate work email verified and profile linked',
      ...json(VerifyWorkEmailOtpResponseSchema),
    },
  },
});

export function serializeDriver(d: CorporateFleetDriverRow) {
  return {
    ...d,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  };
}

export function formatTenant(
  account: CorporateAccountRow,
  branding: CorporateBrandingRow | null,
  emailDomains: string[],
) {
  return {
    id: account.id,
    slug: account.slug,
    legalName: account.legalName,
    cacRcNumber: account.cacRcNumber,
    industry: account.industry,
    headOfficeAddress: account.headOfficeAddress,
    primaryContactName: account.primaryContactName,
    primaryContactEmail: account.primaryContactEmail,
    primaryContactPhone: account.primaryContactPhone,
    billingTier: account.billingTier,
    branding: branding
      ? {
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          secondaryColor: branding.secondaryColor,
          portalTitle: branding.portalTitle,
          welcomeMessage: branding.welcomeMessage,
        }
      : null,
    emailDomains,
  };
}
