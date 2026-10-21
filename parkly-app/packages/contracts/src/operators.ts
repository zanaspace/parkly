import { z } from 'zod';
import { PhoneInputSchema } from './identity.js';

/** Doc 02 §2.3. Kept in sync with the DB enum `operator_type`. */
export const OperatorTypeSchema = z.enum([
  'HOTEL',
  'OFFICE',
  'COMMERCIAL_LOT',
  'EVENT_CENTRE',
  'OTHER',
]);

export const OperatorStatusSchema = z.enum(['ONBOARDING', 'ACTIVE', 'SUSPENDED', 'OFFBOARDED']);
export const KybStatusSchema = z.enum(['NOT_STARTED', 'SUBMITTED', 'APPROVED', 'REJECTED']);

/**
 * CAC registration: RC (companies), BN (business names), IT (incorporated
 * trustees), LP/LLP (partnerships), with or without a space or hyphen.
 * The API stores it upper-cased without separators (e.g. RC123456).
 */
export const CacNumberSchema = z
  .string()
  .trim()
  .regex(/^(RC|BN|IT|LP|LLP)[\s-]?\d{4,8}$/i, 'Use the CAC number format, e.g. RC 123456');

/** FIRS TIN: 8–14 digits, optionally with a hyphen (e.g. 12345678-0001). */
export const TinSchema = z
  .string()
  .trim()
  .regex(/^\d{8}(-?\d{4})?$|^\d{10,14}$/, 'Use the TIN format, e.g. 12345678-0001');

const BusinessDetailsSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradingName: z.string().trim().min(2).max(120),
  type: OperatorTypeSchema,
  cacNumber: CacNumberSchema,
  tin: TinSchema.optional(),
  addressLine: z.string().trim().min(5).max(300),
  contactEmail: z.email().max(254),
  contactPhone: PhoneInputSchema,
});

/** O-03: business details. The caller becomes the operator's OWNER. */
export const CreateOperatorRequestSchema = BusinessDetailsSchema.extend({
  /** The Operator Agreement version the user accepted (must be the current one). */
  agreementVersion: z.string().min(1).max(32),
});

export const UpdateOperatorRequestSchema = BusinessDetailsSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  'nothing to update',
);

export const OperatorSchema = z.object({
  id: z.uuid(),
  legalName: z.string(),
  tradingName: z.string(),
  type: OperatorTypeSchema,
  cacNumber: z.string().nullable(),
  tin: z.string().nullable(),
  addressLine: z.string().nullable(),
  contactEmail: z.string().nullable(),
  /** E.164 (+234…). */
  contactPhone: z.string().nullable(),
  status: OperatorStatusSchema,
  kybStatus: KybStatusSchema,
  kybSubmittedAt: z.iso.datetime().nullable(),
  /** Why KYB was rejected; shown to the owner so they can fix it. */
  kybRejectionReason: z.string().nullable(),
  commissionBps: z.number().int(),
  createdAt: z.iso.datetime(),
});

export type OperatorType = z.infer<typeof OperatorTypeSchema>;
export type Operator = z.infer<typeof OperatorSchema>;
export type CreateOperatorRequest = z.infer<typeof CreateOperatorRequestSchema>;
export type UpdateOperatorRequest = z.infer<typeof UpdateOperatorRequestSchema>;
