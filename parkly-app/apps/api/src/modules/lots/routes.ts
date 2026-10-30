import { randomBytes } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateLotRequestSchema,
  PermitSchema,
  PresignPermitDocumentRequestSchema,
  RatePlanSchema,
  SetRatePlanRequestSchema,
  SubmitPermitRequestSchema,
  LotListSchema,
  LotPhotoSchema,
  LotSchema,
  PresignLotPhotoRequestSchema,
  PresignUploadResponseSchema,
  SetLotVisibilityRequestSchema,
  SetOpeningHoursRequestSchema,
  UpdateLotRequestSchema,
  type Lot,
  type OpeningDay,
  type Permit,
  type RatePlan,
} from '@parkly/contracts';
import {
  checkCapacity,
  checkLotTransition,
  checkPermitDates,
  listability,
  submissionGaps,
  validateRatePlan,
  isInLagosState,
  MAX_LOT_PHOTOS,
  slugify,
  validateOpeningHours,
  type LotActor,
  type LotStatus,
} from '@parkly/domain/lot';
import { isOpenDuring } from '@parkly/domain/availability';
import type { Context } from 'hono';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import {
  SlugTakenError,
  StaleVersionError,
  type LotPhotoRow,
  type LotRow,
  type OpeningHourRow,
  type PermitRow,
  type RatePlanRow,
  type Store,
} from '../../store/types.js';
import { completeUpload, presignUpload } from '../uploads/service.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const OperatorIdParam = z.object({ operatorId: z.uuid() });
const LotParams = OperatorIdParam.extend({ lotId: z.uuid() });

/** Until submission/verification (slice D) and booking capacity rules (S4), only drafts change. */
const EDITABLE = new Set<LotRow['status']>(['DRAFT']);
/**
 * FR-LOT-005: prices can also change on a live or paused lot. Each change waits
 * for admin approval and applies to new bookings only. While a lot is under
 * review its prices are being checked, so they stay put.
 */
const PRICE_EDITABLE = new Set<LotRow['status']>(['DRAFT', 'LIVE', 'PAUSED']);
/**
 * Opening hours can be set on draft lots, and updated on live/paused lots as long
 * as proposed hours do not conflict with active driver bookings.
 */
const HOURS_EDITABLE = new Set<LotRow['status']>(['DRAFT', 'LIVE', 'PAUSED']);

const CAPACITY_MESSAGES = {
  TOTAL_INVALID: ['capacityTotal', 'Enter the total number of spaces (a whole number above 0).'],
  BOOKABLE_INVALID: ['capacityBookable', 'Enter how many spaces Parkly can sell (at least 1).'],
  BOOKABLE_ABOVE_TOTAL: [
    'capacityBookable',
    'Spaces offered on Parkly can’t be more than the lot’s total.',
  ],
} as const;

const HOURS_MESSAGES = {
  BAD_WEEKDAY: 'Unknown day of the week.',
  BAD_TIME: 'Use times like 07:00 or 22:30.',
  SAME_OPEN_AND_CLOSE: 'Opening and closing times can’t be the same.',
  DUPLICATE_DAY: 'Each day can only have one opening window.',
} as const;

function checkLocationAndCapacity(input: {
  location?: { lat: number; lng: number };
  capacityTotal: number;
  capacityBookable: number;
}) {
  const errors: { path: string; message: string }[] = [];
  if (input.location && !isInLagosState(input.location))
    errors.push({ path: 'location', message: 'The pin must be in Lagos State.' });
  const capacity = checkCapacity(input.capacityTotal, input.capacityBookable);
  if (capacity) {
    const [path, message] = CAPACITY_MESSAGES[capacity];
    errors.push({ path, message });
  }
  if (errors.length > 0)
    throw new ApiError('VALIDATION_FAILED', 'Check the lot details', { errors });
}

const toDay = (h: OpeningHourRow): OpeningDay =>
  h.is24h
    ? { weekday: h.weekday, is24h: true }
    : { weekday: h.weekday, is24h: false, opensAt: h.opensAt ?? '', closesAt: h.closesAt ?? '' };

export const toPhoto = (p: LotPhotoRow & { sizeBytes: number }) => ({
  id: p.id,
  sort: p.sort,
  status: p.status,
  sizeBytes: p.sizeBytes,
  uploadedAt: p.createdAt.toISOString(),
});

export const toPermit = (p: PermitRow): Permit => ({
  id: p.id,
  issuer: p.issuer,
  permitNumber: p.permitNumber,
  issuedAt: p.issuedAt,
  expiresAt: p.expiresAt,
  status: p.status,
  rejectionReason: p.rejectionReason,
  submittedAt: p.createdAt.toISOString(),
});

export const toRatePlan = (r: RatePlanRow): RatePlan => ({
  id: r.id,
  product: r.product,
  status: r.status,
  hourlyRateKobo: r.hourlyRateKobo,
  minMinutes: r.minMinutes,
  dailyCapKobo: r.dailyCapKobo,
  dailyRateKobo: r.dailyRateKobo,
  monthlyRateKobo: r.monthlyRateKobo,
  overstayRateKobo: r.overstayRateKobo ?? null,
  overstayGraceMin: r.overstayGraceMin ?? null,
  rejectionReason: r.rejectionReason,
  submittedAt: r.createdAt.toISOString(),
});

/** The lot as operators and admins see it: hours, photos, latest permit, current prices. */
export async function toLotResponse(store: Store, row: LotRow): Promise<Lot> {
  const [hours, photos, permit, current, rejected] = await Promise.all([
    store.lots.openingHours(row.id),
    store.lotPhotos.list(row.id),
    store.permits.latest(row.id),
    store.ratePlans.current(row.id),
    store.ratePlans.latestRejected(row.id),
  ]);
  // Show a rejected change until the operator submits a new one for that product.
  const newestOpen = new Map<string, number>();
  for (const p of current)
    newestOpen.set(p.product, Math.max(newestOpen.get(p.product) ?? 0, p.createdAt.getTime()));
  const plans = [
    ...current,
    ...rejected.filter((r) => r.createdAt.getTime() > (newestOpen.get(r.product) ?? 0)),
  ];
  return {
    id: row.id,
    operatorId: row.operatorId,
    slug: row.slug,
    name: row.name,
    type: row.type,
    description: row.description,
    addressLine: row.addressLine,
    area: row.area,
    lga: row.lga,
    location: row.location,
    entranceNotes: row.entranceNotes,
    capacityTotal: row.capacityTotal,
    capacityBookable: row.capacityBookable,
    amenities: row.amenities as Lot['amenities'],
    vehicleTypes: row.vehicleTypes as Lot['vehicleTypes'],
    status: row.status,
    statusReason: row.statusReason,
    version: row.version,
    openingHours: hours.map(toDay),
    photos: photos.map(toPhoto),
    permit: permit ? toPermit(permit) : null,
    ratePlans: plans.map(toRatePlan),
    createdAt: row.createdAt.toISOString(),
  };
}

/** A permit that still counts toward submission: not rejected or expired. */
const LIVE_PERMIT = new Set<PermitRow['status']>(['SUBMITTED', 'IN_REVIEW', 'APPROVED']);

/** Lots, hours, photos, permit, prices and submission (FR-LOT-002/003/005, doc 02 §6.6). */
export function lotRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };
  const uploadDeps = {
    store: deps.store,
    storage: deps.storage,
    scanner: deps.scanner,
    now: deps.now,
  };

  const toLot = (row: LotRow) => toLotResponse(deps.store, row);

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

  /** Read access hides other operators (404); writes need lot:manage. */
  async function loadLot(
    c: Context<AuthEnv>,
    operatorId: string,
    lotId: string,
    mode: 'read' | 'edit',
  ): Promise<LotRow> {
    authorize(c, deps.logger, 'lot:read', { operatorId }, { denyAs: 'NOT_FOUND' });
    if (mode === 'edit') authorize(c, deps.logger, 'lot:manage', { operatorId });
    const lot = await deps.store.lots.find(operatorId, lotId);
    if (!lot) throw new ApiError('NOT_FOUND');
    if (mode === 'edit' && !EDITABLE.has(lot.status))
      throw new ApiError('INVALID_STATE_TRANSITION', 'Only draft lots can be changed for now');
    return lot;
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/lots',
      tags: ['lots'],
      ...secured,
      request: { params: OperatorIdParam },
      responses: { 200: { description: 'Lots', ...json(LotListSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'lot:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const rows = await deps.store.lots.list(operatorId);
      return c.json(
        {
          items: rows.map((l) => ({
            id: l.id,
            name: l.name,
            addressLine: l.addressLine,
            status: l.status,
            capacityBookable: l.capacityBookable,
            photoCount: l.photoCount,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots',
      tags: ['lots'],
      ...secured,
      request: {
        params: OperatorIdParam,
        body: { ...json(CreateLotRequestSchema), required: true },
      },
      responses: { 201: { description: 'Draft lot', ...json(LotSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'lot:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      authorize(c, deps.logger, 'lot:manage', { operatorId });
      if (!(await deps.store.operators.find(operatorId))) throw new ApiError('NOT_FOUND');
      const body = c.req.valid('json');
      checkLocationAndCapacity(body);

      const fields = {
        operatorId,
        type: body.type,
        name: body.name,
        description: body.description ?? null,
        addressLine: body.addressLine,
        area: body.area ?? null,
        lga: body.lga ?? null,
        location: body.location,
        entranceNotes: body.entranceNotes ?? null,
        capacityTotal: body.capacityTotal,
        capacityBookable: body.capacityBookable,
        amenities: [...new Set(body.amenities)],
        vehicleTypes: [...new Set(body.vehicleTypes)],
        createdBy: c.get('actor').userId,
      };
      // Slug = readable name + 4 random characters; retry on the rare clash.
      let row: LotRow | null = null;
      for (let attempt = 0; attempt < 3 && !row; attempt++) {
        // 36^4 ≈ 1.7M combinations per name; base 36 keeps it lower-case letters and digits.
        const suffix = (randomBytes(4).readUInt32BE(0) % 36 ** 4).toString(36).padStart(4, '0');
        try {
          row = await deps.store.lots.create({
            ...fields,
            slug: `${slugify(body.name)}-${suffix}`,
          });
        } catch (err) {
          if (!(err instanceof SlugTakenError)) throw err;
        }
      }
      if (!row) throw new ApiError('INTERNAL_ERROR');
      await audit(c, deps, { action: 'lot.created', entityType: 'lot', entityId: row.id });
      return c.json(await toLot(row), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/lots/{lotId}',
      tags: ['lots'],
      ...secured,
      request: { params: LotParams },
      responses: { 200: { description: 'Lot', ...json(LotSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      return c.json(await toLot(await loadLot(c, operatorId, lotId, 'read')), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/operators/{operatorId}/lots/{lotId}',
      tags: ['lots'],
      ...secured,
      request: { params: LotParams, body: { ...json(UpdateLotRequestSchema), required: true } },
      responses: { 200: { description: 'Lot updated', ...json(LotSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      const current = await loadLot(c, operatorId, lotId, 'edit');
      const { version, ...patch } = c.req.valid('json');
      // Validate the lot as it will be after the change, not just the fields sent.
      checkLocationAndCapacity({
        ...(patch.location ? { location: patch.location } : {}),
        capacityTotal: patch.capacityTotal ?? current.capacityTotal,
        capacityBookable: patch.capacityBookable ?? current.capacityBookable,
      });
      const changes = {
        ...patch,
        ...(patch.amenities ? { amenities: [...new Set(patch.amenities)] } : {}),
        ...(patch.vehicleTypes ? { vehicleTypes: [...new Set(patch.vehicleTypes)] } : {}),
      };
      let row: LotRow;
      try {
        row = await deps.store.lots.update(operatorId, lotId, version, changes);
      } catch (err) {
        if (err instanceof StaleVersionError) throw new ApiError('CONFLICT_STALE_VERSION');
        throw err;
      }
      await audit(c, deps, {
        action: 'lot.updated',
        entityType: 'lot',
        entityId: lotId,
        after: { fields: Object.keys(patch) },
      });
      return c.json(await toLot(row), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/operators/{operatorId}/lots/{lotId}/opening-hours',
      tags: ['lots'],
      ...secured,
      request: {
        params: LotParams,
        body: { ...json(SetOpeningHoursRequestSchema), required: true },
      },
      responses: { 200: { description: 'Lot with its new hours', ...json(LotSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      authorize(c, deps.logger, 'lot:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      authorize(c, deps.logger, 'lot:manage', { operatorId });
      const lot = await deps.store.lots.find(operatorId, lotId);
      if (!lot) throw new ApiError('NOT_FOUND');
      if (!HOURS_EDITABLE.has(lot.status))
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Opening hours can only be changed while a lot is draft, live, or paused',
        );

      const { days } = c.req.valid('json');
      const problems = validateOpeningHours(days);
      if (problems.length > 0)
        throw new ApiError('VALIDATION_FAILED', 'Check the opening hours', {
          errors: problems.map((p) => ({
            path: `days.${p.weekday}`,
            message: HOURS_MESSAGES[p.problem],
          })),
        });

      if (lot.status !== 'DRAFT') {
        const upcoming = await deps.store.bookings.listUpcomingForLot(lotId, deps.now());
        const active = upcoming.filter(
          (b) =>
            b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'PENDING_PAYMENT',
        );
        const conflicting = active.filter(
          (b) =>
            !isOpenDuring({
              hours: days,
              startAt: b.startAt,
              endAt: b.endAt,
              product: b.product === 'DAILY' ? 'DAILY' : 'HOURLY',
            }),
        );
        if (conflicting.length > 0) {
          throw new ApiError(
            'LOT_HAS_FUTURE_BOOKINGS',
            `Cannot change opening hours: ${conflicting.length} driver booking(s) fall outside the proposed hours. Existing bookings must be honoured.`,
            {
              errors: conflicting.slice(0, 5).map((b) => ({
                path: `days.${b.startAt.getUTCDay()}`,
                message: `Booking ${b.code} (${b.startAt.toISOString().slice(0, 16)} to ${b.endAt.toISOString().slice(0, 16)}) falls outside new opening hours`,
              })),
            },
          );
        }
      }

      await deps.store.lots.setOpeningHours(
        lotId,
        days.map((d) => ({
          weekday: d.weekday,
          is24h: d.is24h,
          opensAt: d.is24h ? null : d.opensAt,
          closesAt: d.is24h ? null : d.closesAt,
        })),
      );
      await audit(c, deps, { action: 'lot.hours_set', entityType: 'lot', entityId: lotId });
      return c.json(await toLot(lot), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots/{lotId}/photos',
      tags: ['lots'],
      ...secured,
      request: {
        params: LotParams,
        body: { ...json(PresignLotPhotoRequestSchema), required: true },
      },
      responses: { 201: { description: 'Upload URL', ...json(PresignUploadResponseSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      await loadLot(c, operatorId, lotId, 'edit');
      if ((await deps.store.lotPhotos.list(lotId)).length >= MAX_LOT_PHOTOS)
        throw new ApiError('VALIDATION_FAILED', `A lot can have at most ${MAX_LOT_PHOTOS} photos`);
      const body = c.req.valid('json');
      const res = await presignUpload(uploadDeps, {
        purpose: 'LOT_PHOTO',
        owner: { type: 'lot', id: lotId },
        uploadedBy: c.get('actor').userId,
        declared: { mime: body.contentType, sizeBytes: body.sizeBytes, sha256: body.sha256 },
      });
      if (!res.ok)
        throw res.reason === 'TYPE_NOT_ALLOWED'
          ? new ApiError('UPLOAD_TYPE_NOT_ALLOWED')
          : new ApiError('VALIDATION_FAILED', res.reason);
      return c.json(
        { fileId: res.fileId, uploadUrl: res.uploadUrl, expiresInSec: res.expiresInSec },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots/{lotId}/photos/{fileId}/complete',
      tags: ['lots'],
      ...secured,
      request: { params: LotParams.extend({ fileId: z.uuid() }) },
      responses: { 201: { description: 'Photo added', ...json(LotPhotoSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId, fileId } = c.req.valid('param');
      await loadLot(c, operatorId, lotId, 'edit');
      const photos = await deps.store.lotPhotos.list(lotId);
      const existing = photos.find((p) => p.fileId === fileId);
      if (existing) return c.json(toPhoto(existing), 201);

      const res = await completeUpload(uploadDeps, {
        fileId,
        purpose: 'LOT_PHOTO',
        owner: { type: 'lot', id: lotId },
      });
      if (!res.ok) {
        if (res.reason === 'NOT_FOUND') throw new ApiError('NOT_FOUND');
        if (res.reason === 'NOT_UPLOADED') throw new ApiError('UPLOAD_NOT_RECEIVED');
        throw new ApiError('UPLOAD_REJECTED', res.reason);
      }
      const sort = photos.reduce((max, p) => Math.max(max, p.sort + 1), 0);
      const photo = await deps.store.lotPhotos.create({ lotId, fileId, sort });
      await audit(c, deps, {
        action: 'lot.photo_added',
        entityType: 'lot',
        entityId: lotId,
        after: { photoId: photo.id },
      });
      return c.json(toPhoto({ ...photo, sizeBytes: res.file.sizeBytes }), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/operators/{operatorId}/lots/{lotId}/photos/{photoId}',
      tags: ['lots'],
      ...secured,
      request: { params: LotParams.extend({ photoId: z.uuid() }) },
      responses: { 204: { description: 'Photo removed' } },
    }),
    async (c) => {
      const { operatorId, lotId, photoId } = c.req.valid('param');
      await loadLot(c, operatorId, lotId, 'edit');
      const photo = await deps.store.lotPhotos.find(lotId, photoId);
      if (!photo) throw new ApiError('NOT_FOUND');
      const file = await deps.store.files.find(photo.fileId);
      if (file) await deps.storage.remove({ bucket: file.bucket, paths: [file.path] });
      await deps.store.lotPhotos.remove(lotId, photoId);
      await audit(c, deps, {
        action: 'lot.photo_removed',
        entityType: 'lot',
        entityId: lotId,
        after: { photoId },
      });
      return c.body(null, 204);
    },
  );

  // FR-LOT-003, step 1: signed upload URL for the permit scan (private `permits` bucket).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots/{lotId}/permits/document',
      tags: ['lots'],
      ...secured,
      request: {
        params: LotParams,
        body: { ...json(PresignPermitDocumentRequestSchema), required: true },
      },
      responses: { 201: { description: 'Upload URL', ...json(PresignUploadResponseSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      await loadLot(c, operatorId, lotId, 'edit');
      const body = c.req.valid('json');
      const res = await presignUpload(uploadDeps, {
        purpose: 'PERMIT_DOCUMENT',
        owner: { type: 'lot', id: lotId },
        uploadedBy: c.get('actor').userId,
        declared: { mime: body.contentType, sizeBytes: body.sizeBytes, sha256: body.sha256 },
      });
      if (!res.ok) throw new ApiError('VALIDATION_FAILED', res.reason);
      return c.json(
        { fileId: res.fileId, uploadUrl: res.uploadUrl, expiresInSec: res.expiresInSec },
        201,
      );
    },
  );

  // Step 2: permit details with the uploaded scan. Ops reviews it (slice E).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots/{lotId}/permits',
      tags: ['lots'],
      ...secured,
      request: { params: LotParams, body: { ...json(SubmitPermitRequestSchema), required: true } },
      responses: { 201: { description: 'Permit submitted', ...json(PermitSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      await loadLot(c, operatorId, lotId, 'edit');
      const body = c.req.valid('json');
      const dates = checkPermitDates({
        issuedOn: body.issuedAt,
        expiresOn: body.expiresAt,
        now: deps.now(),
      });
      if (dates === 'PERMIT_EXPIRED') throw new ApiError('PERMIT_EXPIRED');
      if (dates)
        throw new ApiError('VALIDATION_FAILED', 'Check the permit dates', {
          errors: [
            {
              path: 'expiresAt',
              message:
                'The expiry date must be after the issue date, and the issue date can’t be in the future.',
            },
          ],
        });
      const upload = await completeUpload(uploadDeps, {
        fileId: body.fileId,
        purpose: 'PERMIT_DOCUMENT',
        owner: { type: 'lot', id: lotId },
      });
      if (!upload.ok) {
        if (upload.reason === 'NOT_FOUND') throw new ApiError('NOT_FOUND');
        if (upload.reason === 'NOT_UPLOADED') throw new ApiError('UPLOAD_NOT_RECEIVED');
        throw new ApiError('UPLOAD_REJECTED', upload.reason);
      }
      const permit = await deps.store.permits.create({
        lotId,
        permitNumber: body.permitNumber,
        issuedAt: body.issuedAt,
        expiresAt: body.expiresAt,
        documentFileId: body.fileId,
        submittedBy: c.get('actor').userId,
      });
      await audit(c, deps, {
        action: 'lot.permit_submitted',
        entityType: 'lot',
        entityId: lotId,
        after: { permitId: permit.id, expiresAt: permit.expiresAt },
      });
      return c.json(toPermit(permit), 201);
    },
  );

  // FR-LOT-005: every price change waits for admin approval and applies to new bookings only.
  app.openapi(
    createRoute({
      method: 'put',
      path: '/operators/{operatorId}/lots/{lotId}/rate-plans',
      tags: ['lots'],
      ...secured,
      request: { params: LotParams, body: { ...json(SetRatePlanRequestSchema), required: true } },
      responses: { 200: { description: 'Rate plan awaiting approval', ...json(RatePlanSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      const lot = await loadLot(c, operatorId, lotId, 'read');
      authorize(c, deps.logger, 'lot:manage', { operatorId });
      if (!PRICE_EDITABLE.has(lot.status))
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Prices can’t change while the lot is in this state',
        );
      const body = c.req.valid('json');
      const prices = {
        hourlyRateKobo: body.product === 'HOURLY' ? body.hourlyRateKobo : null,
        minMinutes: body.product === 'HOURLY' ? body.minMinutes : 60,
        dailyCapKobo: body.product === 'HOURLY' ? (body.dailyCapKobo ?? null) : null,
        dailyRateKobo: body.product === 'DAILY' ? body.dailyRateKobo : null,
        monthlyRateKobo: body.product === 'MONTHLY' ? body.monthlyRateKobo : null,
        overstayRateKobo: body.product === 'HOURLY' ? (body.overstayRateKobo ?? null) : null,
        overstayGraceMin: body.product === 'HOURLY' ? (body.overstayGraceMin ?? null) : null,
      };
      // ADR 0016: Parkly caps the operator's overstay price and sets the minimum grace.
      const [overstayMaxMultiplier, minGraceMin] = await Promise.all([
        deps.store.settings.get<number>('fees.overstay_max_multiplier').then((v) => v ?? 2),
        deps.store.settings.get<number>('session.overstay_grace_min').then((v) => v ?? 10),
      ]);
      const problems = validateRatePlan(
        { product: body.product, ...prices },
        { overstayMaxMultiplier, minGraceMin },
      );
      if (problems.length > 0)
        throw new ApiError('RATE_PLAN_INVALID', 'Check the prices', {
          errors: problems.map((p) => ({ path: p.field, message: p.message })),
        });
      const plan = await deps.store.ratePlans.submit({
        lotId,
        product: body.product,
        ...prices,
        submittedBy: c.get('actor').userId,
      });
      await audit(c, deps, {
        action: 'lot.rate_plan_submitted',
        entityType: 'lot',
        entityId: lotId,
        after: { ratePlanId: plan.id, product: plan.product, ...prices },
      });
      return c.json(toRatePlan(plan), 200);
    },
  );

  // Doc 02 §3.3: DRAFT → PENDING_VERIFICATION once everything is in.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots/{lotId}/submit',
      tags: ['lots'],
      ...secured,
      request: { params: LotParams },
      responses: { 200: { description: 'Lot submitted', ...json(LotSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      authorize(c, deps.logger, 'lot:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      authorize(c, deps.logger, 'lot:manage', { operatorId });
      const lot = await deps.store.lots.find(operatorId, lotId);
      if (!lot) throw new ApiError('NOT_FOUND');

      const [photos, hours, plans, permit, payout] = await Promise.all([
        deps.store.lotPhotos.list(lotId),
        deps.store.lots.openingHours(lotId),
        deps.store.ratePlans.current(lotId),
        deps.store.permits.latest(lotId),
        deps.store.payoutAccounts.find(operatorId),
      ]);
      const permitUsable =
        !!permit &&
        LIVE_PERMIT.has(permit.status) &&
        checkPermitDates({
          issuedOn: permit.issuedAt,
          expiresOn: permit.expiresAt,
          now: deps.now(),
        }) === null;
      const isOwner = c
        .get('actor')
        .roles.some((r) => r.role === 'OPERATOR_OWNER' && r.operatorId === operatorId);

      const check = checkLotTransition({
        from: lot.status,
        to: 'PENDING_VERIFICATION',
        actor: isOwner ? 'OPERATOR_OWNER' : 'OPERATOR_MANAGER',
        facts: {
          submissionGaps: submissionGaps({
            profileComplete: true, // name, address, pin and capacity are required at creation
            photoCount: photos.length,
            hasOpeningHours: hours.length > 0,
            hasRatePlan: plans.length > 0,
            permitSubmitted: permitUsable,
            payoutAccountVerified: payout?.status === 'VERIFIED' || payout?.status === 'ACTIVE',
          }),
          // Only the submission guard applies to this transition.
          listability: { listable: false, problems: [] },
          hasFutureBookings: false,
        },
      });
      if (!check.ok) {
        if (check.code === 'LOT_INCOMPLETE')
          throw new ApiError('LOT_INCOMPLETE', 'Some items are missing', {
            errors: (check.missing ?? []).map((m) => ({ path: m, message: m })),
          });
        throw new ApiError(check.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'INVALID_STATE_TRANSITION');
      }

      let row: LotRow;
      try {
        row = await deps.store.lots.setStatus(
          operatorId,
          lotId,
          'DRAFT',
          'PENDING_VERIFICATION',
          null,
        );
      } catch (err) {
        if (err instanceof StaleVersionError) throw new ApiError('INVALID_STATE_TRANSITION');
        throw err;
      }
      await audit(c, deps, {
        action: 'lot.submitted',
        entityType: 'lot',
        entityId: lotId,
        before: { status: 'DRAFT' },
        after: { status: 'PENDING_VERIFICATION' },
      });
      return c.json(await toLot(row), 200);
    },
  );

  // --- visibility: pause / resume listing by operator (FR-LOT-006) -----------------------

  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots/{lotId}/visibility',
      tags: ['lots'],
      ...secured,
      request: {
        params: LotParams,
        body: { ...json(SetLotVisibilityRequestSchema), required: true },
      },
      responses: { 200: { description: 'Lot visibility updated', ...json(LotSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      authorize(c, deps.logger, 'lot:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      authorize(c, deps.logger, 'lot:manage', { operatorId });

      const lot = await deps.store.lots.find(operatorId, lotId);
      if (!lot) throw new ApiError('NOT_FOUND');

      const { visible } = c.req.valid('json');
      const targetStatus: LotStatus = visible ? 'LIVE' : 'PAUSED';

      if (lot.status === targetStatus) {
        return c.json(await toLot(lot), 200);
      }

      const held = new Set<string>(c.get('actor').roles.map((r) => r.role));
      const operatorRoles: LotActor[] = ['OPERATOR_OWNER', 'OPERATOR_MANAGER'];
      const actorRole = operatorRoles.find((r) => held.has(r)) ?? 'OPERATOR_OWNER';

      const gate = await listabilityOf(lot);
      const check = checkLotTransition({
        from: lot.status,
        to: targetStatus,
        actor: actorRole,
        facts: {
          submissionGaps: [],
          listability: gate,
          hasFutureBookings: false,
        },
      });

      if (!check.ok) {
        if (check.code === 'LOT_NOT_LISTABLE' || check.code === 'LOT_PERMIT_INVALID') {
          throw new ApiError(check.code, 'The lot cannot go live yet', {
            errors: (check.missing ?? []).map((m) => ({ path: m, message: m })),
          });
        }
        throw new ApiError(check.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'INVALID_STATE_TRANSITION');
      }

      let row: LotRow;
      try {
        row = await deps.store.lots.setStatus(operatorId, lotId, lot.status, targetStatus, null);
      } catch (err) {
        if (err instanceof StaleVersionError) throw new ApiError('INVALID_STATE_TRANSITION');
        throw err;
      }

      await audit(c, deps, {
        action: visible ? 'lot.resumed' : 'lot.paused',
        entityType: 'lot',
        entityId: lotId,
        before: { status: lot.status },
        after: { status: targetStatus },
      });

      return c.json(await toLot(row), 200);
    },
  );

  return app;
}
