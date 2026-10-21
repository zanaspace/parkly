import { z } from 'zod';
import { KybDocumentSchema, PayoutAccountSchema } from './kyb.js';
import { KybStatusSchema, OperatorSchema, OperatorTypeSchema } from './operators.js';

/** X-05 KYB queue row (doc 03 §4). */
export const AdminOperatorSummarySchema = z.object({
  id: z.uuid(),
  legalName: z.string(),
  tradingName: z.string(),
  type: OperatorTypeSchema,
  kybStatus: KybStatusSchema,
  kybSubmittedAt: z.iso.datetime().nullable(),
  /** True when the bank's account name differs from the legal name (doc 03 O-05). */
  payoutNameMismatch: z.boolean().nullable(),
});
export const AdminOperatorListSchema = z.object({ items: z.array(AdminOperatorSummarySchema) });
export const AdminOperatorListQuerySchema = z.object({
  kybStatus: KybStatusSchema.optional(),
});

export const AdminOperatorDetailSchema = z.object({
  operator: OperatorSchema,
  documents: z.array(KybDocumentSchema),
  payoutAccount: PayoutAccountSchema.nullable(),
  owner: z.object({ firstName: z.string().nullable(), lastName: z.string().nullable() }).nullable(),
});

/** Approve, or reject with a reason the owner will see. */
export const KybReviewRequestSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE') }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(5).max(500) }),
]);

/** A short-lived link to a private file (≤ 5 min for C4, doc 06 §2). */
export const SignedUrlSchema = z.object({ url: z.url(), expiresInSec: z.number().int() });

export type AdminOperatorSummary = z.infer<typeof AdminOperatorSummarySchema>;
export type AdminOperatorDetail = z.infer<typeof AdminOperatorDetailSchema>;
export type KybReviewRequest = z.infer<typeof KybReviewRequestSchema>;
