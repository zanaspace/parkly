import { randomBytes } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateLotRequestSchema,
  LotListSchema,
  LotPhotoSchema,
  LotSchema,
  PresignLotPhotoRequestSchema,
  PresignUploadResponseSchema,
  SetOpeningHoursRequestSchema,
  UpdateLotRequestSchema,
  type Lot,
  type OpeningDay,
} from '@parkly/contracts';
import {
  checkCapacity,
  isInLagosState,
  MAX_LOT_PHOTOS,
  slugify,
  validateOpeningHours,
} from '@parkly/domain/lot';
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
} from '../../store/types.js';
import { completeUpload, presignUpload } from '../uploads/service.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const OperatorIdParam = z.object({ operatorId: z.uuid() });
const LotParams = OperatorIdParam.extend({ lotId: z.uuid() });

/** Until submission/verification (slice D) and booking capacity rules (S4), only drafts change. */
const EDITABLE = new Set<LotRow['status']>(['DRAFT']);

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

const toPhoto = (p: LotPhotoRow & { sizeBytes: number }) => ({
  id: p.id,
  sort: p.sort,
  status: p.status,
  sizeBytes: p.sizeBytes,
  uploadedAt: p.createdAt.toISOString(),
});

/** Lots, opening hours and photos for operator owners and managers (FR-LOT-002, doc 02 §6.6). */
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

  async function toLot(row: LotRow): Promise<Lot> {
    const [hours, photos] = await Promise.all([
      deps.store.lots.openingHours(row.id),
      deps.store.lotPhotos.list(row.id),
    ]);
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
      createdAt: row.createdAt.toISOString(),
    };
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
      const lot = await loadLot(c, operatorId, lotId, 'edit');
      const { days } = c.req.valid('json');
      const problems = validateOpeningHours(days);
      if (problems.length > 0)
        throw new ApiError('VALIDATION_FAILED', 'Check the opening hours', {
          errors: problems.map((p) => ({
            path: `days.${p.weekday}`,
            message: HOURS_MESSAGES[p.problem],
          })),
        });
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

  return app;
}
