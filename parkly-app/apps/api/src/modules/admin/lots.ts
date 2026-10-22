import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AdminLotDetailSchema,
  AdminLotListQuerySchema,
  AdminLotListSchema,
  AdminLotStatusRequestSchema,
  CreateVerificationRequestSchema,
  LotPhotoSchema,
  LotSchema,
  PermitReviewRequestSchema,
  PermitSchema,
  RatePlanSchema,
  ReviewRequestSchema,
  SignedUrlSchema,
  VerificationRecordSchema,
  type VerificationRecord,
} from '@parkly/contracts';
import {
  canReview,
  checkLotTransition,
  checkPermitDates,
  evaluateChecklist,
  listability,
  verificationValidUntil,
  type LotActor,
  type LotTransitionResult,
} from '@parkly/domain/lot';
import { v7 as uuidv7 } from 'uuid';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { StaleVersionError, type LotRow, type VerificationRow } from '../../store/types.js';
import { toLotResponse, toPermit, toPhoto, toRatePlan } from '../lots/routes.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const LotIdParam = z.object({ lotId: z.uuid() });
/** Doc 06 §2: links to private files live at most 5 minutes. */
const LINK_SECONDS = 300;
const ADMIN_LOT_ACTORS: readonly LotActor[] = ['SUPER_ADMIN', 'ADMIN_OPS', 'ADMIN_COMPLIANCE'];
/** Inspection times a little ahead of the server clock are device clock drift, not the future. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const STATUS_AUDIT: Record<string, string> = {
  'PENDING_VERIFICATION>LIVE': 'lot.went_live',
  'SUSPENDED>LIVE': 'lot.reinstated',
  'PENDING_VERIFICATION>DRAFT': 'lot.sent_back',
  'LIVE>SUSPENDED': 'lot.suspended',
  'PAUSED>SUSPENDED': 'lot.suspended',
};

const toVerification = (v: VerificationRow): VerificationRecord => ({
  id: v.id,
  status: v.status,
  inspectorUserId: v.inspectorUserId,
  inspectedAt: v.inspectedAt.toISOString(),
  capacityCounted: v.capacityCounted,
  gps: v.gps,
  notes: v.notes,
  items: v.items,
  validUntil: v.validUntil,
  rejectionReason: v.rejectionReason,
  submittedAt: v.createdAt.toISOString(),
});

/** Turns StaleVersionError (someone else decided first) into INVALID_STATE_TRANSITION. */
async function decided<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof StaleVersionError)
      throw new ApiError('INVALID_STATE_TRANSITION', 'This was already decided');
    throw err;
  }
}

/**
 * X-02/X-03/X-04/X-06 lot review for Parkly staff (FR-LOT-004/006, FR-ADM-001,
 * doc 02 §6.8): permit, prices, photos and the site visit, then go-live and
 * the other admin status moves. Every decision is audited.
 */
export function adminLotRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  async function mustLot(lotId: string): Promise<LotRow> {
    const lot = await deps.store.lots.findById(lotId);
    if (!lot) throw new ApiError('NOT_FOUND');
    return lot;
  }

  /** The doc 02 §3.3 listing gate, from the lot's latest permit, visit, prices and operator. */
  async function listabilityOf(lot: LotRow) {
    const [permit, visit, plans, operator] = await Promise.all([
      deps.store.permits.latest(lot.id),
      deps.store.verifications.latest(lot.id),
      deps.store.ratePlans.current(lot.id),
      deps.store.operators.find(lot.operatorId),
    ]);
    return listability({
      permit: permit && { status: permit.status, expiresOn: permit.expiresAt },
      verification: visit && { status: visit.status, validUntil: visit.validUntil },
      hasActiveRatePlan: plans.some((p) => p.status === 'ACTIVE'),
      operatorActive: operator?.status === 'ACTIVE' && operator.kybStatus === 'APPROVED',
      now: deps.now(),
    });
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/lots',
      tags: ['admin'],
      ...secured,
      request: { query: AdminLotListQuerySchema },
      responses: { 200: { description: 'Lot queue', ...json(AdminLotListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:review', {});
      const { status } = c.req.valid('query');
      const rows = await deps.store.lots.listByStatus(status);
      return c.json(
        {
          items: rows.map((l) => ({
            id: l.id,
            name: l.name,
            addressLine: l.addressLine,
            area: l.area,
            status: l.status,
            operatorId: l.operatorId,
            operatorName: l.operatorName,
            photoCount: l.photoCount,
            pendingPriceCount: l.pendingPriceCount,
            createdAt: l.createdAt.toISOString(),
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/lots/{lotId}',
      tags: ['admin'],
      ...secured,
      request: { params: LotIdParam },
      responses: { 200: { description: 'Lot for review', ...json(AdminLotDetailSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:review', {});
      const lot = await mustLot(c.req.valid('param').lotId);
      const [operator, photos, permit, visit, gate, fourEyes] = await Promise.all([
        deps.store.operators.find(lot.operatorId),
        deps.store.lotPhotos.list(lot.id),
        deps.store.permits.latest(lot.id),
        deps.store.verifications.latest(lot.id),
        listabilityOf(lot),
        deps.store.flags.enabled('four_eyes_verification'),
      ]);
      if (!operator) throw new ApiError('NOT_FOUND');
      const photoLinks = await Promise.all(
        photos.map(async (p) => {
          const file = await deps.store.files.find(p.fileId);
          const url = file
            ? await deps.storage.createSignedDownloadUrl({
                bucket: file.bucket,
                path: file.path,
                expiresInSec: LINK_SECONDS,
              })
            : null;
          return url ? { ...toPhoto(p), url } : null;
        }),
      );
      return c.json(
        {
          lot: await toLotResponse(deps.store, lot),
          operator: {
            id: operator.id,
            legalName: operator.legalName,
            tradingName: operator.tradingName,
            status: operator.status,
            kybStatus: operator.kybStatus,
          },
          photos: photoLinks.filter((p) => p !== null),
          permitReviewNote: permit?.reviewNote ?? null,
          verification: visit ? toVerification(visit) : null,
          listability: gate,
          fourEyesVerification: fourEyes,
        },
        200,
      );
    },
  );

  // --- permit (X-04) ------------------------------------------------------------

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/permits/{permitId}/document-url',
      tags: ['admin'],
      ...secured,
      request: { params: z.object({ permitId: z.uuid() }) },
      responses: { 200: { description: 'Short-lived link', ...json(SignedUrlSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'permit:review', {});
      const { permitId } = c.req.valid('param');
      const permit = await deps.store.permits.find(permitId);
      const file = permit?.documentFileId
        ? await deps.store.files.find(permit.documentFileId)
        : null;
      if (!permit || !file || file.status !== 'VERIFIED') throw new ApiError('NOT_FOUND');
      const url = await deps.storage.createSignedDownloadUrl({
        bucket: file.bucket,
        path: file.path,
        expiresInSec: LINK_SECONDS,
      });
      await audit(c, deps, {
        action: 'permit.document_viewed',
        entityType: 'permit',
        entityId: permitId,
        after: { lotId: permit.lotId },
      });
      return c.json({ url, expiresInSec: LINK_SECONDS }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/permits/{permitId}/review',
      tags: ['admin'],
      ...secured,
      request: {
        params: z.object({ permitId: z.uuid() }),
        body: { ...json(PermitReviewRequestSchema), required: true },
      },
      responses: { 200: { description: 'Reviewed permit', ...json(PermitSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'permit:review', {});
      const { permitId } = c.req.valid('param');
      const review = c.req.valid('json');
      const permit = await deps.store.permits.find(permitId);
      if (!permit) throw new ApiError('NOT_FOUND');
      if (!canReview(permit.status))
        throw new ApiError('INVALID_STATE_TRANSITION', 'This permit is not awaiting review');
      const reviewer = { reviewerId: c.get('actor').userId, at: deps.now() };

      if (review.decision === 'REJECT') {
        const row = await decided(() =>
          deps.store.permits.reject(permitId, { ...reviewer, reason: review.reason }),
        );
        await audit(c, deps, {
          action: 'permit.rejected',
          entityType: 'permit',
          entityId: permitId,
          after: { lotId: permit.lotId, reason: review.reason },
        });
        return c.json(toPermit(row), 200);
      }
      const dates = checkPermitDates({
        issuedOn: permit.issuedAt,
        expiresOn: permit.expiresAt,
        now: deps.now(),
      });
      if (dates === 'PERMIT_EXPIRED') throw new ApiError('PERMIT_EXPIRED');
      const row = await decided(() =>
        deps.store.permits.approve(permitId, { ...reviewer, note: review.note }),
      );
      await audit(c, deps, {
        action: 'permit.approved',
        entityType: 'permit',
        entityId: permitId,
        after: { lotId: permit.lotId, expiresAt: permit.expiresAt, note: review.note },
      });
      return c.json(toPermit(row), 200);
    },
  );

  // --- prices -----------------------------------------------------------------------

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/rate-plans/{ratePlanId}/review',
      tags: ['admin'],
      ...secured,
      request: {
        params: z.object({ ratePlanId: z.uuid() }),
        body: { ...json(ReviewRequestSchema), required: true },
      },
      responses: { 200: { description: 'Reviewed price', ...json(RatePlanSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'rate-plan:review', {});
      const { ratePlanId } = c.req.valid('param');
      const review = c.req.valid('json');
      const plan = await deps.store.ratePlans.find(ratePlanId);
      if (!plan) throw new ApiError('NOT_FOUND');
      if (plan.status !== 'PENDING_APPROVAL')
        throw new ApiError('INVALID_STATE_TRANSITION', 'This price is not awaiting approval');
      const reviewer = { reviewerId: c.get('actor').userId, at: deps.now() };
      const prices = {
        product: plan.product,
        hourlyRateKobo: plan.hourlyRateKobo,
        minMinutes: plan.minMinutes,
        dailyCapKobo: plan.dailyCapKobo,
        dailyRateKobo: plan.dailyRateKobo,
        monthlyRateKobo: plan.monthlyRateKobo,
      };
      const row = await decided(() =>
        review.decision === 'APPROVE'
          ? deps.store.ratePlans.approve(ratePlanId, reviewer)
          : deps.store.ratePlans.reject(ratePlanId, { ...reviewer, reason: review.reason }),
      );
      await audit(c, deps, {
        action: review.decision === 'APPROVE' ? 'rate_plan.approved' : 'rate_plan.rejected',
        entityType: 'rate_plan',
        entityId: ratePlanId,
        after: {
          lotId: plan.lotId,
          ...prices,
          ...(review.decision === 'REJECT' && { reason: review.reason }),
        },
      });
      return c.json(toRatePlan(row), 200);
    },
  );

  // --- photos -----------------------------------------------------------------------

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/lot-photos/{photoId}/review',
      tags: ['admin'],
      ...secured,
      request: {
        params: z.object({ photoId: z.uuid() }),
        body: { ...json(ReviewRequestSchema), required: true },
      },
      responses: { 200: { description: 'Reviewed photo', ...json(LotPhotoSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:review', {});
      const { photoId } = c.req.valid('param');
      const review = c.req.valid('json');
      const photo = await deps.store.lotPhotos.findById(photoId);
      const file = photo ? await deps.store.files.find(photo.fileId) : null;
      if (!photo || !file) throw new ApiError('NOT_FOUND');
      if (photo.status !== 'PENDING')
        throw new ApiError('INVALID_STATE_TRANSITION', 'This photo was already reviewed');
      const now = deps.now();
      const reviewer = { reviewerId: c.get('actor').userId, at: now };

      if (review.decision === 'REJECT') {
        const row = await decided(() =>
          deps.store.lotPhotos.review(photoId, { status: 'REJECTED' }, reviewer),
        );
        await audit(c, deps, {
          action: 'lot.photo_rejected',
          entityType: 'lot',
          entityId: photo.lotId,
          after: { photoId, reason: review.reason },
        });
        return c.json(toPhoto({ ...row, sizeBytes: file.sizeBytes }), 200);
      }

      // Doc 02 §2.4: approved photos are copied to the public bucket (C1) for drivers.
      const bytes = await deps.storage.download({ bucket: file.bucket, path: file.path });
      if (!bytes) throw new ApiError('UPLOAD_NOT_RECEIVED');
      const publicId = uuidv7();
      const path = `lots/${photo.lotId}/${photoId}.webp`;
      await deps.storage.upload({
        bucket: 'lot-photos-public',
        path,
        body: bytes,
        contentType: file.mime,
      });
      await deps.store.files.create({
        id: publicId,
        bucket: 'lot-photos-public',
        path,
        dataClass: 'C1',
        retentionPolicy: 'lot_life',
        ownerEntityType: 'lot',
        ownerEntityId: photo.lotId,
        uploadedBy: reviewer.reviewerId,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        createdAt: now,
      });
      await deps.store.files.markVerified(
        publicId,
        { mime: file.mime, sizeBytes: file.sizeBytes, sha256: file.sha256 },
        now,
      );
      let row;
      try {
        row = await deps.store.lotPhotos.review(
          photoId,
          { status: 'APPROVED', publicFileId: publicId },
          reviewer,
        );
      } catch (err) {
        // Someone else decided first: drop our copy so nothing public is left unowned.
        if (err instanceof StaleVersionError) {
          await deps.store.files.markRejected(publicId, 'DELETED');
          await deps.storage.remove({ bucket: 'lot-photos-public', paths: [path] });
          throw new ApiError('INVALID_STATE_TRANSITION', 'This was already decided');
        }
        throw err;
      }
      await audit(c, deps, {
        action: 'lot.photo_approved',
        entityType: 'lot',
        entityId: photo.lotId,
        after: { photoId },
      });
      return c.json(toPhoto({ ...row, sizeBytes: file.sizeBytes }), 200);
    },
  );

  // --- site visit (X-03) -------------------------------------------------------------

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/lots/{lotId}/verifications',
      tags: ['admin'],
      ...secured,
      request: {
        params: LotIdParam,
        body: { ...json(CreateVerificationRequestSchema), required: true },
      },
      responses: {
        201: { description: 'Visit recorded', ...json(VerificationRecordSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:verify', {});
      const lot = await mustLot(c.req.valid('param').lotId);
      const body = c.req.valid('json');
      if (lot.status === 'DRAFT' || lot.status === 'ARCHIVED')
        throw new ApiError('INVALID_STATE_TRANSITION', 'This lot is not ready for a site visit');
      const inspectedAt = new Date(body.inspectedAt);
      if (inspectedAt.getTime() > deps.now().getTime() + CLOCK_SKEW_MS)
        throw new ApiError('VALIDATION_FAILED', 'The visit can’t be in the future', {
          errors: [{ path: 'inspectedAt', message: 'The visit can’t be in the future.' }],
        });
      const latest = await deps.store.verifications.latest(lot.id);
      if (latest && canReview(latest.status))
        throw new ApiError('INVALID_STATE_TRANSITION', 'A visit is already awaiting review');

      const row = await deps.store.verifications.create({
        lotId: lot.id,
        inspectorUserId: c.get('actor').userId,
        inspectedAt,
        capacityCounted: body.capacityCounted,
        gps: body.gps ?? null,
        notes: body.notes ?? null,
        validUntil: verificationValidUntil(inspectedAt),
        items: body.items.map((i) => ({
          item: i.item,
          result: i.result,
          comment: i.comment ?? null,
        })),
      });
      const checklist = evaluateChecklist(row.items);
      // GPS at inspection is C2 and stays out of the audit log.
      await audit(c, deps, {
        action: 'lot.verification_recorded',
        entityType: 'lot',
        entityId: lot.id,
        after: {
          verificationId: row.id,
          capacityCounted: row.capacityCounted,
          failed: checklist.failed,
          missing: checklist.missing,
        },
      });
      return c.json(toVerification(row), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/verifications/{verificationId}/review',
      tags: ['admin'],
      ...secured,
      request: {
        params: z.object({ verificationId: z.uuid() }),
        body: { ...json(ReviewRequestSchema), required: true },
      },
      responses: {
        200: { description: 'Reviewed visit', ...json(VerificationRecordSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:verify', {});
      const { verificationId } = c.req.valid('param');
      const review = c.req.valid('json');
      const visit = await deps.store.verifications.find(verificationId);
      if (!visit) throw new ApiError('NOT_FOUND');
      if (!canReview(visit.status))
        throw new ApiError('INVALID_STATE_TRANSITION', 'This visit is not awaiting review');
      const actorId = c.get('actor').userId;
      // Doc 03 §4.1: with four-eyes on, the inspector cannot approve their own visit.
      if (
        visit.inspectorUserId === actorId &&
        (await deps.store.flags.enabled('four_eyes_verification'))
      )
        throw new ApiError('FOUR_EYES_REQUIRED', 'Another ops person must review this visit');
      const reviewer = { reviewerId: actorId, at: deps.now() };

      if (review.decision === 'REJECT') {
        const row = await decided(() =>
          deps.store.verifications.reject(verificationId, { ...reviewer, reason: review.reason }),
        );
        await audit(c, deps, {
          action: 'lot.verification_rejected',
          entityType: 'lot',
          entityId: visit.lotId,
          after: { verificationId, reason: review.reason },
        });
        return c.json(toVerification(row), 200);
      }

      const checklist = evaluateChecklist(visit.items);
      if (!checklist.passed)
        throw new ApiError('VERIFICATION_CHECKLIST_FAILED', 'Required checks did not pass', {
          errors: [
            ...checklist.failed.map((item) => ({ path: item, message: 'FAILED' })),
            ...checklist.missing.map((item) => ({ path: item, message: 'MISSING' })),
          ],
        });
      const before = await deps.store.lots.findById(visit.lotId);
      const row = await decided(() => deps.store.verifications.approve(verificationId, reviewer));
      await audit(c, deps, {
        action: 'lot.verification_approved',
        entityType: 'lot',
        entityId: visit.lotId,
        before: before && { capacityTotal: before.capacityTotal },
        after: {
          verificationId,
          validUntil: row.validUntil,
          capacityCounted: row.capacityCounted,
        },
      });
      return c.json(toVerification(row), 200);
    },
  );

  // --- status: go live, send back, suspend, reinstate, archive (X-06) -------------------

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/lots/{lotId}/status',
      tags: ['admin'],
      ...secured,
      request: {
        params: LotIdParam,
        body: { ...json(AdminLotStatusRequestSchema), required: true },
      },
      responses: { 200: { description: 'Lot moved', ...json(LotSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'lot:review', {});
      const lot = await mustLot(c.req.valid('param').lotId);
      const { status: to, reason } = c.req.valid('json');
      const gate = await listabilityOf(lot);
      const held = new Set<string>(c.get('actor').roles.map((r) => r.role));

      // The domain table decides who may make each move; any admin role held can qualify.
      let check: LotTransitionResult = { ok: false, code: 'FORBIDDEN' };
      for (const actor of ADMIN_LOT_ACTORS.filter((a) => held.has(a))) {
        check = checkLotTransition({
          from: lot.status,
          to,
          actor,
          reason: reason ?? null,
          // Bookings arrive in S4; until then no lot has future bookings.
          facts: { submissionGaps: [], listability: gate, hasFutureBookings: false },
        });
        if (check.ok || check.code !== 'FORBIDDEN') break;
      }
      if (!check.ok) {
        const missing = (check.missing ?? []).map((m) => ({ path: m, message: m }));
        switch (check.code) {
          case 'REASON_REQUIRED':
            throw new ApiError('VALIDATION_FAILED', 'A reason is required', {
              errors: [{ path: 'reason', message: 'Say why; the operator will see it.' }],
            });
          case 'LOT_PERMIT_INVALID':
          case 'LOT_NOT_LISTABLE':
            throw new ApiError(check.code, 'The lot can’t be listed yet', { errors: missing });
          case 'LOT_HAS_FUTURE_BOOKINGS':
          case 'FORBIDDEN':
            throw new ApiError(check.code);
          default:
            throw new ApiError('INVALID_STATE_TRANSITION');
        }
      }

      const row = await decided(() =>
        deps.store.lots.setStatus(lot.operatorId, lot.id, lot.status, to, reason ?? null),
      );
      await audit(c, deps, {
        action: STATUS_AUDIT[`${lot.status}>${to}`] ?? `lot.${to.toLowerCase()}`,
        entityType: 'lot',
        entityId: lot.id,
        before: { status: lot.status },
        after: { status: to, reason: reason ?? null },
      });
      return c.json(await toLotResponse(deps.store, row), 200);
    },
  );

  return app;
}
