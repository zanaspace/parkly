import { z } from 'zod';

export const CorporateBrandingSchema = z.object({
  logoUrl: z.string().url(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  portalTitle: z.string(),
  welcomeMessage: z.string().nullable(),
});
export type CorporateBranding = z.infer<typeof CorporateBrandingSchema>;

export const CorporateTenantResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  legalName: z.string(),
  industry: z.string(),
  billingTier: z.string(),
  branding: CorporateBrandingSchema.nullable(),
  emailDomains: z.array(z.string()),
});
export type CorporateTenantResponse = z.infer<typeof CorporateTenantResponseSchema>;

export const ResolveCorporateDomainResponseSchema = z.object({
  corporateId: z.string(),
  slug: z.string(),
  subdomain: z.string(),
  customDomain: z.string().nullable(),
  isVerified: z.boolean(),
  legalName: z.string(),
});
export type ResolveCorporateDomainResponse = z.infer<typeof ResolveCorporateDomainResponseSchema>;

export const CreateCorporateTenantRequestSchema = z.object({
  legalName: z.string().min(2).max(200),
  cacRcNumber: z.string().min(3).max(50),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  industry: z.string().min(2).max(80),
  headOfficeAddress: z.string().min(3).max(500),
  primaryContactName: z.string().min(2).max(120),
  primaryContactEmail: z.string().email(),
  primaryContactPhone: z.string().min(7).max(30),
  emailDomain: z.string().min(3).max(254),
  branding: z.object({
    logoUrl: z.string().url().optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .default('#E31837'),
    secondaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .default('#1E1E1E'),
    portalTitle: z.string().min(2).max(150),
    welcomeMessage: z.string().max(500).nullable().optional(),
  }),
  costCenter: z
    .object({
      code: z.string().min(2).max(50).default('CC-MAIN-01'),
      name: z.string().min(2).max(120).default('Headquarters Staff'),
      monthlyBudgetKobo: z.number().int().positive().optional(),
    })
    .optional(),
});
export type CreateCorporateTenantRequest = z.infer<typeof CreateCorporateTenantRequestSchema>;
