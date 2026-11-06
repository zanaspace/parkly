import { z } from 'zod';

export const PaymentProviderSchema = z.enum(['PAYSTACK', 'FLUTTERWAVE', 'FAKE']);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const ReconciliationResultSchema = z.enum([
  'MATCHED',
  'MISSING_INTERNAL',
  'MISSING_PROVIDER',
  'AMOUNT_MISMATCH',
  'STATUS_MISMATCH',
  'AUTO_FIXED',
]);
export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;

export const ReconciliationRunStatusSchema = z.enum([
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_EXCEPTIONS',
  'FAILED',
]);
export type ReconciliationRunStatus = z.infer<typeof ReconciliationRunStatusSchema>;

export const ReconciliationRunSchema = z.object({
  id: z.uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  provider: PaymentProviderSchema,
  status: ReconciliationRunStatusSchema,
  totalInternal: z.number().int().min(0),
  totalProvider: z.number().int().min(0),
  matchedCount: z.number().int().min(0),
  mismatchedCount: z.number().int().min(0),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ReconciliationRun = z.infer<typeof ReconciliationRunSchema>;

export const ReconciliationItemSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  paymentId: z.uuid().nullable(),
  providerReference: z.string(),
  result: ReconciliationResultSchema,
  details: z.record(z.string(), z.unknown()),
  resolvedBy: z.uuid().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  resolutionNotes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ReconciliationItem = z.infer<typeof ReconciliationItemSchema>;

export const ReconciliationRunListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ReconciliationRunListQuery = z.infer<typeof ReconciliationRunListQuerySchema>;

export const ReconciliationItemListQuerySchema = z.object({
  result: ReconciliationResultSchema.optional(),
  unresolvedOnly: z.coerce.boolean().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ReconciliationItemListQuery = z.infer<typeof ReconciliationItemListQuerySchema>;

export const ResolveReconciliationItemRequestSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(5, 'Provide at least 5 characters explaining the resolution')
    .max(500),
});
export type ResolveReconciliationItemRequest = z.infer<
  typeof ResolveReconciliationItemRequestSchema
>;

export const ReconciliationRunListResponseSchema = z.object({
  runs: z.array(ReconciliationRunSchema),
  nextCursor: z.string().nullable(),
});
export type ReconciliationRunListResponse = z.infer<typeof ReconciliationRunListResponseSchema>;

export const ReconciliationItemListResponseSchema = z.object({
  items: z.array(ReconciliationItemSchema),
  nextCursor: z.string().nullable(),
});
export type ReconciliationItemListResponse = z.infer<typeof ReconciliationItemListResponseSchema>;
