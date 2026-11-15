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
  cacRcNumber: z.string().optional(),
  industry: z.string(),
  headOfficeAddress: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  primaryContactPhone: z.string().optional(),
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

export const UpdateCorporateProfileRequestSchema = z.object({
  legalName: z.string().min(2).max(200).optional(),
  cacRcNumber: z.string().min(3).max(50).optional(),
  industry: z.string().min(2).max(80).optional(),
  headOfficeAddress: z.string().min(3).max(500).optional(),
  primaryContactName: z.string().min(2).max(120).optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactPhone: z.string().min(7).max(30).optional(),
  emailDomain: z.string().min(3).max(254).optional(),
  branding: z
    .object({
      logoUrl: z.string().url().optional(),
      primaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      secondaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      portalTitle: z.string().min(2).max(150).optional(),
      welcomeMessage: z.string().max(500).nullable().optional(),
    })
    .optional(),
});
export type UpdateCorporateProfileRequest = z.infer<typeof UpdateCorporateProfileRequestSchema>;

export const CorporateFleetDriverSchema = z.object({
  id: z.string(),
  corporateId: z.string(),
  driverName: z.string(),
  phone: z.string(),
  vehiclePlate: z.string().nullable(),
  joinCode: z.string(),
  approvalStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED']),
  userId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CorporateFleetDriver = z.infer<typeof CorporateFleetDriverSchema>;

export const CreateFleetDriverRequestSchema = z.object({
  driverName: z.string().min(2).max(120),
  phone: z.string().min(7).max(30),
  vehiclePlate: z.string().min(2).max(20).optional().nullable(),
});
export type CreateFleetDriverRequest = z.infer<typeof CreateFleetDriverRequestSchema>;

export const DriverJoinRequestSchema = z.object({
  phone: z.string().min(7).max(30),
  joinCode: z.string().min(4).max(20),
});
export type DriverJoinRequest = z.infer<typeof DriverJoinRequestSchema>;

export const DriverJoinResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  driver: CorporateFleetDriverSchema,
  corporate: z.object({
    id: z.string(),
    slug: z.string(),
    legalName: z.string(),
  }),
});
export type DriverJoinResponse = z.infer<typeof DriverJoinResponseSchema>;

export const UpdateFleetDriverStatusRequestSchema = z.object({
  approvalStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED']),
});
export type UpdateFleetDriverStatusRequest = z.infer<typeof UpdateFleetDriverStatusRequestSchema>;

export const UpdateFleetDriverRequestSchema = z.object({
  driverName: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(30).optional(),
  vehiclePlate: z.string().min(2).max(20).optional().nullable(),
  approvalStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED']).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateFleetDriverRequest = z.infer<typeof UpdateFleetDriverRequestSchema>;

export const CorporateDriverLoginRequestSchema = z.object({
  phone: z.string().trim().min(5).max(30),
  joinCode: z.string().trim().min(3).max(20),
});
export type CorporateDriverLoginRequest = z.infer<typeof CorporateDriverLoginRequestSchema>;

export const CorporateDriverLoginResponseSchema = z.object({
  token: z.string(),
  corporate: z.object({
    id: z.string(),
    slug: z.string(),
    legalName: z.string(),
  }),
  driver: CorporateFleetDriverSchema,
});
export type CorporateDriverLoginResponse = z.infer<typeof CorporateDriverLoginResponseSchema>;
