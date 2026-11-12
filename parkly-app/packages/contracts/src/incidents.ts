import { z } from 'zod';

/** Same words as doc 00 and the database enums (FR-INC-001). */
export const IncidentCategorySchema = z.enum([
  'SAFETY',
  'DAMAGE',
  'THEFT',
  'OVERCHARGE',
  'TOUT',
  'ACCESS_DENIED',
  'LOT_FULL',
  'APP_ISSUE',
  'OTHER',
]);
export const IncidentSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const IncidentStatusSchema = z.enum(['OPEN', 'TRIAGED', 'RESOLVED', 'CLOSED']);

export const CreateIncidentRequestSchema = z.object({
  lotId: z.uuid(),
  /** The booking it is about, if any. It has to be at the same lot. */
  bookingId: z.uuid().optional(),
  category: IncidentCategorySchema,
  severity: IncidentSeveritySchema,
  description: z.string().trim().min(10).max(2000),
});

export const IncidentSchema = z.object({
  id: z.uuid(),
  lotId: z.uuid(),
  lotName: z.string(),
  bookingId: z.uuid().nullable(),
  bookingCode: z.string().nullable(),
  category: IncidentCategorySchema,
  severity: IncidentSeveritySchema,
  /** S1 (critical) to S4 (low), as the PRD names them. */
  severityLabel: z.string(),
  status: IncidentStatusSchema,
  description: z.string(),
  reporterRole: z.string(),
  assigneeId: z.uuid().nullable(),
  resolution: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** When a first response is due (OPEN → TRIAGED). */
  triageDueAt: z.iso.datetime(),
  /** Still OPEN past the deadline. */
  overdue: z.boolean(),
  triagedAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
});

export const IncidentNoteSchema = z.object({
  id: z.uuid(),
  authorId: z.uuid(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export const IncidentDetailSchema = z.object({
  incident: IncidentSchema,
  notes: z.array(IncidentNoteSchema),
});

export const IncidentListQuerySchema = z.object({
  status: IncidentStatusSchema.optional(),
  lotId: z.uuid().optional(),
  severity: IncidentSeveritySchema.optional(),
});

export const IncidentListSchema = z.object({
  /** Worst severity first, then oldest. */
  items: z.array(IncidentSchema),
});

/** What to do to an incident; the status follows from the action (doc 02 §3.6). */
export const IncidentActionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('TRIAGE'),
    /** Defaults to the person triaging it. */
    assigneeId: z.uuid().optional(),
  }),
  z.object({ action: z.literal('RESOLVE'), resolution: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal('CLOSE') }),
  z.object({ action: z.literal('REOPEN'), reason: z.string().trim().min(5).max(500) }),
]);

export const AddIncidentNoteRequestSchema = z.object({
  body: z.string().trim().min(2).max(2000),
});

/** FR-INC-004: lots with 3 or more incidents in the last 30 days. */
export const LotIncidentFlagsSchema = z.object({
  items: z.array(
    z.object({
      lotId: z.uuid(),
      lotName: z.string(),
      operatorName: z.string(),
      incidentCount: z.number().int(),
      windowDays: z.number().int(),
    }),
  ),
});

export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;
export type IncidentView = z.infer<typeof IncidentSchema>;
export type CreateIncidentResponse = z.infer<typeof CreateIncidentResponseSchema>;
export type IncidentDetail = z.infer<typeof IncidentDetailSchema>;
export type IncidentList = z.infer<typeof IncidentListSchema>;
export type LotIncidentFlags = z.infer<typeof LotIncidentFlagsSchema>;

export const CreateIncidentResponseSchema = z.object({
  incident: IncidentSchema,
  /** FR-INC-004: this incident is the one that took the lot to 3 in 30 days. */
  lotFlaggedForReview: z.boolean(),
});
