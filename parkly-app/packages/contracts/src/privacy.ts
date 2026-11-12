import { z } from 'zod';

/** NDPA data-subject requests (doc 06 sections 6 and 11, FR-AUTH-007, NFR-PRIV-001). */
export const DataRequestTypeSchema = z.enum([
  'ACCESS',
  'CORRECTION',
  'DELETION',
  'PORTABILITY',
  'OBJECTION',
]);
export const DataRequestStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]);

/** A driver asks for a copy of their data; the file is ready at once for a normal account. */
export const DataExportResponseSchema = z.object({
  requestId: z.uuid(),
  status: z.literal('COMPLETED'),
});

/** A short-lived link to the export file; ask again for a fresh one while the file exists. */
export const DataExportDownloadSchema = z.object({
  url: z.url(),
  expiresInSeconds: z.number().int(),
});

export const CancelDeletionResponseSchema = z.object({ status: z.literal('ACTIVE') });

/** One row of the compliance queue: who asked (first name only), what, and by when. */
export const DataRequestItemSchema = z.object({
  id: z.uuid(),
  type: DataRequestTypeSchema,
  status: DataRequestStatusSchema,
  userFirstName: z.string().nullable(),
  /** The person's account: PENDING_DELETION while the 30 days run, DELETED once erased. */
  userStatus: z.string(),
  createdAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  /** Still open and past its due date (a deletion's due date is when erasure may start). */
  overdue: z.boolean(),
});

export const DataRequestListQuerySchema = z.object({
  status: DataRequestStatusSchema.optional(),
  type: DataRequestTypeSchema.optional(),
});

export const DataRequestListSchema = z.object({ items: z.array(DataRequestItemSchema) });

export type DataRequestItem = z.infer<typeof DataRequestItemSchema>;
export type DataRequestList = z.infer<typeof DataRequestListSchema>;
