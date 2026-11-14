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
