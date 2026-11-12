import { z } from 'zod';
import { KybStatusSchema, OperatorStatusSchema } from './operators.js';
import { LatLngSchema, LotPhotoSchema, LotSchema, LotStatusSchema } from './lots.js';

/** X-02 lot queue row (doc 03 §4.1). */
export const AdminLotSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  addressLine: z.string(),
  area: z.string().nullable(),
  status: LotStatusSchema,
  operatorId: z.uuid(),
  operatorName: z.string(),
  photoCount: z.number().int(),
  /** Price changes waiting for approval (live lots can change prices, FR-LOT-005). */
  pendingPriceCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export const AdminLotListSchema = z.object({ items: z.array(AdminLotSummarySchema) });
export const AdminLotListQuerySchema = z.object({
  status: LotStatusSchema.default('PENDING_VERIFICATION'),
});

/** Doc 02 §2.4. Kept in sync with @parkly/domain VERIFICATION_ITEMS. */
export const VerificationItemSchema = z.enum([
  'LASPA_PERMIT',
  'GUARD_PRESENCE',
  'LIGHTING',
  'CCTV',
  'ACCESS_CONTROL',
  'CAPACITY_COUNT',
  'OWNER_IDENTITY',
  'ENTRANCE_SIGNAGE',
  'FIRE_SAFETY',
]);
export const CheckResultSchema = z.enum(['PASS', 'FAIL', 'NA']);
const ReviewStatusSchema = z.enum(['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED']);

/** X-03 on-site checklist, recorded by the inspector after the visit. */
export const CreateVerificationRequestSchema = z.object({
  inspectedAt: z.iso.datetime(),
  /** Spaces counted on site; replaces the operator's total when it is lower. */
  capacityCounted: z.number().int().min(1).max(100_000),
  gps: LatLngSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        item: VerificationItemSchema,
        result: CheckResultSchema,
        comment: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(9)
    .refine((items) => new Set(items.map((i) => i.item)).size === items.length, {
      message: 'Each checklist item can appear once',
    }),
});

export const VerificationRecordSchema = z.object({
  id: z.uuid(),
  status: ReviewStatusSchema,
  inspectorUserId: z.uuid(),
  inspectedAt: z.iso.datetime(),
  capacityCounted: z.number().int(),
  gps: LatLngSchema.nullable(),
  notes: z.string().nullable(),
  items: z.array(
    z.object({
      item: VerificationItemSchema,
      result: CheckResultSchema,
      comment: z.string().nullable(),
    }),
  ),
  /** Lagos calendar day; the verification no longer counts from this day. */
  validUntil: z.iso.date(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.iso.datetime(),
});

/** Doc 02 §3.3 listing gate: why a lot can or cannot go LIVE. Mirrors @parkly/domain ListingProblem. */
export const ListingProblemSchema = z.enum([
  'PERMIT_MISSING',
  'PERMIT_NOT_APPROVED',
  'PERMIT_EXPIRED',
  'VERIFICATION_MISSING',
  'VERIFICATION_NOT_APPROVED',
  'VERIFICATION_STALE',
  'NO_ACTIVE_RATE_PLAN',
  'OPERATOR_NOT_ACTIVE',
]);

export const AdminLotDetailSchema = z.object({
  lot: LotSchema,
  operator: z.object({
    id: z.uuid(),
    legalName: z.string(),
    tradingName: z.string(),
    status: OperatorStatusSchema,
    kybStatus: KybStatusSchema,
  }),
  /** Private photos with links valid for 5 minutes. */
  photos: z.array(LotPhotoSchema.extend({ url: z.url() })),
  /** How ops checked the permit with LASPA (internal, never shown to operators). */
  permitReviewNote: z.string().nullable(),
  verification: VerificationRecordSchema.nullable(),
  listability: z.object({ listable: z.boolean(), problems: z.array(ListingProblemSchema) }),
  /** When on, the person who recorded a visit cannot also approve it. */
  fourEyesVerification: z.boolean(),
});

/** Approve with how LASPA confirmed it (method + reference), or reject with a reason. */
export const PermitReviewRequestSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE'), note: z.string().trim().min(5).max(500) }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(5).max(500) }),
]);

/** Rate plans, photos and verifications: approve, or reject with a reason. */
export const ReviewRequestSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE') }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(5).max(500) }),
]);

/** Doc 02 §3.3 admin moves: go live, send back to draft, suspend, reinstate, archive. */
export const AdminLotStatusRequestSchema = z.object({
  status: z.enum(['LIVE', 'DRAFT', 'SUSPENDED', 'ARCHIVED']),
  /** Shown to the operator; required for every move except a first go-live. */
  reason: z.string().trim().min(5).max(500).optional(),
});

export type AdminLotSummary = z.infer<typeof AdminLotSummarySchema>;
export type AdminLotDetail = z.infer<typeof AdminLotDetailSchema>;
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
export type VerificationItem = z.infer<typeof VerificationItemSchema>;
export type CreateVerificationRequest = z.infer<typeof CreateVerificationRequestSchema>;
export type ListingProblem = z.infer<typeof ListingProblemSchema>;
export type PermitReviewRequest = z.infer<typeof PermitReviewRequestSchema>;
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
export type AdminLotStatusRequest = z.infer<typeof AdminLotStatusRequestSchema>;

/** Doc 03 §4.3: what suspending a car park does to drivers who have booked it. */
export const LotSuspensionImpactSchema = z.object({
  lotId: z.uuid(),
  lotName: z.string(),
  /** Paid and not started: these can be cancelled with a full refund. */
  upcoming: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      startAt: z.iso.datetime(),
      endAt: z.iso.datetime(),
      totalKobo: z.number().int(),
      driverFirstName: z.string().nullable(),
    }),
  ),
  /** Cars parked there now (checked in). They are always honoured. */
  activeCount: z.number().int(),
  /** Unpaid holds. They lapse by themselves. */
  holdCount: z.number().int(),
  totalRefundKobo: z.number().int(),
});

export const CancelUpcomingRequestSchema = z.object({
  /** Kept in the audit log with each cancellation. */
  reason: z.string().trim().min(5).max(500),
});

export const CancelUpcomingResponseSchema = z.object({
  cancelled: z.number().int(),
  /** Bookings left for ops to deal with by hand (the cancel failed). */
  failed: z.array(z.object({ code: z.string(), message: z.string() })),
  refundedKobo: z.number().int(),
});

export type LotSuspensionImpact = z.infer<typeof LotSuspensionImpactSchema>;
export type CancelUpcomingRequest = z.infer<typeof CancelUpcomingRequestSchema>;
export type CancelUpcomingResponse = z.infer<typeof CancelUpcomingResponseSchema>;
