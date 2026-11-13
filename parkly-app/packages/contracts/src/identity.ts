import { z } from 'zod';

/** Doc 00 §3.7. Kept in sync with @parkly/domain ROLES and the DB enum. */
export const RoleSchema = z.enum([
  'DRIVER',
  'OPERATOR_OWNER',
  'OPERATOR_MANAGER',
  'OPERATOR_ATTENDANT',
  'ADMIN_SUPPORT',
  'ADMIN_OPS',
  'ADMIN_FINANCE',
  'ADMIN_COMPLIANCE',
  'SUPER_ADMIN',
]);

export const RoleGrantSchema = z.object({
  role: RoleSchema,
  operatorId: z.uuid().nullable(),
});

export const PlatformSchema = z.enum(['ANDROID', 'IOS', 'WEB', 'PWA']);

export const ConsentTypeSchema = z.enum([
  'TERMS',
  'PRIVACY',
  'MARKETING',
  'LOCATION',
  'OPERATOR_AGREEMENT',
]);

/** Raw input; the API normalises to E.164 and rejects non-Nigerian mobiles. */
export const PhoneInputSchema = z.string().trim().min(1).max(20);

// --- /v1/auth -------------------------------------------------------------

export const OtpPrecheckRequestSchema = z.object({
  phone: PhoneInputSchema,
  deviceId: z.uuid(),
});

export const BootstrapRequestSchema = z.object({
  deviceId: z.uuid(),
  platform: PlatformSchema,
  appVersion: z.string().max(32).optional(),
  /**
   * Driver apps send true: an email sign-up (ADR 0015) becomes a driver here,
   * as phone sign-ups do in the database. Operators sign up by email too, so
   * the role is never given from the email alone.
   */
  asDriver: z.boolean().optional(),
});

export const SessionRevokeRequestSchema = z.object({
  scope: z.enum(['device', 'all']),
});

// --- /v1/me ---------------------------------------------------------------

export const MeSchema = z.object({
  id: z.uuid(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phoneLast4: z.string().nullable(),
  status: z.enum(['ACTIVE', 'LOCKED', 'SUSPENDED', 'PENDING_DELETION', 'DELETED']),
  roles: z.array(RoleGrantSchema),
  /** False until the driver has a first name and has accepted current terms + privacy. */
  profileComplete: z.boolean(),
  consents: z.object({
    termsVersion: z.string().nullable(),
    privacyVersion: z.string().nullable(),
    marketing: z.boolean(),
  }),
  /** Versions the client must show for acceptance. */
  currentLegalVersions: z.object({
    terms: z.string(),
    privacy: z.string(),
    operatorAgreement: z.string(),
  }),
  /** FR-AUTH-009 / FR-PASS-005: Tier 2 Nigerian driver identity verification status. */
  isVerifiedDriver: z.boolean().default(false),
  verifiedAt: z.iso.datetime().nullable().default(null),
});

export const BootstrapResponseSchema = z.object({
  user: MeSchema,
  isNewUser: z.boolean(),
});

const NameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[\p{L}\p{M}' .-]+$/u, 'letters, spaces, apostrophes and hyphens only');

export const UpdateMeRequestSchema = z
  .object({ firstName: NameSchema, lastName: NameSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'nothing to update');

export const ConsentRequestSchema = z.object({
  type: ConsentTypeSchema,
  version: z.string().min(1).max(32),
  granted: z.boolean(),
});

export const DeviceRequestSchema = z.object({
  deviceId: z.uuid(),
  platform: PlatformSchema,
  pushToken: z.string().max(512).optional(),
  appVersion: z.string().max(32).optional(),
});

export const DeletionRequestResponseSchema = z.object({
  requestId: z.uuid(),
  status: z.literal('PENDING_DELETION'),
});

// --- /v1/me/vehicles ------------------------------------------------------

export const VehicleSchema = z.object({
  id: z.uuid(),
  plate: z.string(),
  plateNorm: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  colour: z.string().nullable(),
  isDefault: z.boolean(),
});

const VehicleTextSchema = z.string().trim().min(1).max(40);

export const CreateVehicleRequestSchema = z.object({
  plate: z.string().trim().min(2).max(20),
  make: VehicleTextSchema.optional(),
  model: VehicleTextSchema.optional(),
  colour: VehicleTextSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const UpdateVehicleRequestSchema = z
  .object({
    make: VehicleTextSchema,
    model: VehicleTextSchema,
    colour: VehicleTextSchema,
    isDefault: z.literal(true),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'nothing to update');

export const VehicleListSchema = z.object({ items: z.array(VehicleSchema) });

// --- /v1/me/verification (FR-AUTH-009 Tier 2 KYC) --------------------------

export const DriverVerificationMethodSchema = z.enum(['FRSC_LICENSE', 'NIN_PHONE']);
export const DriverVerificationStatusSchema = z.enum(['VERIFIED', 'REJECTED', 'FAILED']);

export const VerifyDriverIdentityRequestSchema = z.object({
  method: DriverVerificationMethodSchema,
  idNumber: z.string().trim().min(5).max(32),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
});

export const DriverVerificationRecordSchema = z.object({
  id: z.uuid(),
  method: DriverVerificationMethodSchema,
  status: DriverVerificationStatusSchema,
  maskedIdNumber: z.string(),
  provider: z.enum(['DOJAH', 'FAKE']),
  providerReference: z.string(),
  verifiedName: z.string().nullable(),
  verifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const DriverVerificationSchema = z.object({
  isVerifiedDriver: z.boolean(),
  verifiedAt: z.iso.datetime().nullable(),
  verification: DriverVerificationRecordSchema.nullable(),
});

// --- admin audit log -------------------------------------------------------

export const AuditLogQuerySchema = z.object({
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(128).optional(),
  actorUserId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const AuditLogEntrySchema = z.object({
  id: z.uuid(),
  actorUserId: z.uuid().nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const AuditLogPageSchema = z.object({
  items: z.array(AuditLogEntrySchema),
  nextCursor: z.string().nullable(),
});

export type Me = z.infer<typeof MeSchema>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export type RoleGrant = z.infer<typeof RoleGrantSchema>;
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
export type DriverVerificationMethod = z.infer<typeof DriverVerificationMethodSchema>;
export type DriverVerificationStatus = z.infer<typeof DriverVerificationStatusSchema>;
export type VerifyDriverIdentityRequest = z.infer<typeof VerifyDriverIdentityRequestSchema>;
export type DriverVerificationRecord = z.infer<typeof DriverVerificationRecordSchema>;
export type DriverVerification = z.infer<typeof DriverVerificationSchema>;
