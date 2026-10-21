import { z } from 'zod';
import { OperatorTypeSchema } from './operators.js';

/** Doc 02 §2.4. Kept in sync with @parkly/domain AMENITIES / VEHICLE_TYPES. */
export const AmenitySchema = z.enum([
  'GUARD',
  'CCTV',
  'LIGHTING',
  'COVERED',
  'EV',
  'ACCESS_CONTROL',
  'TOILET',
]);
export const VehicleTypeSchema = z.enum(['CAR', 'SUV', 'BUS']);
export const LotStatusSchema = z.enum([
  'DRAFT',
  'PENDING_VERIFICATION',
  'LIVE',
  'PAUSED',
  'SUSPENDED',
  'ARCHIVED',
]);

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const LotFieldsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: OperatorTypeSchema,
  description: z.string().trim().max(1000).optional(),
  addressLine: z.string().trim().min(5).max(300),
  area: z.string().trim().max(80).optional(),
  lga: z.string().trim().max(80).optional(),
  location: LatLngSchema,
  entranceNotes: z.string().trim().max(500).optional(),
  capacityTotal: z.number().int(),
  capacityBookable: z.number().int(),
  amenities: z.array(AmenitySchema).max(7),
  vehicleTypes: z.array(VehicleTypeSchema).min(1).max(3),
});

/** O-11 steps 1–3. Creates a DRAFT lot. */
export const CreateLotRequestSchema = LotFieldsSchema;

/** Optimistic concurrency: send the `version` you loaded (CONFLICT_STALE_VERSION if it moved on). */
export const UpdateLotRequestSchema = LotFieldsSchema.partial().extend({
  version: z.number().int().positive(),
});

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM, 24-hour');

/** One entry per open weekday (0 = Sunday); a day left out is closed. Times are Africa/Lagos. */
export const OpeningDaySchema = z.discriminatedUnion('is24h', [
  z.object({ weekday: z.number().int(), is24h: z.literal(true) }),
  z.object({
    weekday: z.number().int(),
    is24h: z.literal(false),
    opensAt: TimeSchema,
    closesAt: TimeSchema,
  }),
]);
export const SetOpeningHoursRequestSchema = z.object({ days: z.array(OpeningDaySchema).max(7) });

export const LotPhotoSchema = z.object({
  id: z.uuid(),
  sort: z.number().int(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  sizeBytes: z.number().int(),
  uploadedAt: z.iso.datetime(),
});

export const LotSchema = LotFieldsSchema.extend({
  id: z.uuid(),
  operatorId: z.uuid(),
  slug: z.string(),
  description: z.string().nullable(),
  area: z.string().nullable(),
  lga: z.string().nullable(),
  entranceNotes: z.string().nullable(),
  status: LotStatusSchema,
  statusReason: z.string().nullable(),
  version: z.number().int(),
  openingHours: z.array(OpeningDaySchema),
  photos: z.array(LotPhotoSchema),
  createdAt: z.iso.datetime(),
});

export const LotSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  addressLine: z.string(),
  status: LotStatusSchema,
  capacityBookable: z.number().int(),
  photoCount: z.number().int(),
});
export const LotListSchema = z.object({ items: z.array(LotSummarySchema) });

/** Doc 03 O-11 step 2: JPG, PNG or WebP; re-encoded to WebP after upload. */
export const PresignLotPhotoRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i, 'SHA-256 as 64 hex characters'),
});

export type Amenity = z.infer<typeof AmenitySchema>;
export type VehicleType = z.infer<typeof VehicleTypeSchema>;
export type Lot = z.infer<typeof LotSchema>;
export type LotSummary = z.infer<typeof LotSummarySchema>;
export type LotPhoto = z.infer<typeof LotPhotoSchema>;
export type OpeningDay = z.infer<typeof OpeningDaySchema>;
export type CreateLotRequest = z.infer<typeof CreateLotRequestSchema>;
export type UpdateLotRequest = z.infer<typeof UpdateLotRequestSchema>;
