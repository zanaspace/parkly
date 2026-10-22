import { z } from 'zod';
import { BookingStatusSchema } from './bookings.js';

/**
 * Attendant PWA (doc 02 §6.7, doc 01 §5.3, ADR 0005). The app keeps the
 * manifest and an event queue offline and syncs batches when it can.
 */

export const EntryMethodSchema = z.enum(['QR', 'CODE', 'PLATE']);

/** `POST /v1/attend/devices`: this phone, for this lot. Managers approve attendant phones. */
export const RegisterDeviceRequestSchema = z.object({
  clientDeviceId: z.uuid(),
  lotId: z.uuid(),
});
export const AttendDeviceSchema = z.object({
  id: z.uuid(),
  lotId: z.uuid(),
  approved: z.boolean(),
  revoked: z.boolean(),
});

/** `GET /v1/attend/lots`: the lots this person may work (LIVE or PAUSED). */
export const AttendLotListSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), name: z.string(), status: z.string() })),
});

/** One booking as the gate needs it. */
export const ManifestBookingSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  plateNorm: z.string(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  status: BookingStatusSchema,
  checkedInAt: z.iso.datetime().nullable(),
  checkedOutAt: z.iso.datetime().nullable(),
});

/** `GET /v1/attend/lots/{lotId}/manifest`: everything the gate needs for 24 h offline. */
export const ManifestSchema = z.object({
  /** For the device's clock offset (doc 03 §3.8). */
  serverTime: z.iso.datetime(),
  lot: z.object({ id: z.uuid(), name: z.string(), capacityBookable: z.number().int() }),
  rules: z.object({
    earlyArrivalMin: z.number().int(),
    noShowGraceMin: z.number().int(),
    overstayGraceMin: z.number().int(),
  }),
  /** Ed25519 public keys for offline QR checks (ADR 0007); base64url. */
  keys: z.array(
    z.object({ kid: z.string(), publicKey: z.string(), status: z.enum(['ACTIVE', 'RETIRING']) }),
  ),
  revokedKids: z.array(z.string()),
  bookings: z.array(ManifestBookingSchema),
  walkIns: z.number().int(),
});

const base = { clientEventId: z.uuid(), deviceTime: z.iso.datetime() };

export const AttendEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('CHECK_IN'),
    bookingId: z.uuid(),
    method: EntryMethodSchema,
    plateSeen: z.string().max(12).optional(),
    /** Required when the gate showed amber (early, late, duplicate, provisional). */
    overrideReason: z.string().max(200).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('CHECK_OUT'),
    bookingId: z.uuid(),
    method: EntryMethodSchema,
  }),
  z.object({ ...base, type: z.literal('WALK_IN'), delta: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({
    ...base,
    type: z.literal('ISSUE'),
    note: z.string().trim().min(1).max(500),
    bookingId: z.uuid().optional(),
  }),
]);

/** `POST /v1/attend/sync`: up to 500 queued events, oldest first. */
export const SyncRequestSchema = z.object({
  clientDeviceId: z.uuid(),
  lotId: z.uuid(),
  batchId: z.uuid(),
  deviceSentAt: z.iso.datetime(),
  events: z.array(AttendEventSchema).max(500),
});

export const SyncResultSchema = z.object({
  clientEventId: z.uuid(),
  result: z.enum(['APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED']),
  reason: z.string().nullable(),
});
export const SyncResponseSchema = z.object({
  serverTime: z.iso.datetime(),
  results: z.array(SyncResultSchema),
});

/** Portal: attendant phones waiting for approval or in use (O-20). */
export const OperatorDeviceSchema = z.object({
  id: z.uuid(),
  lotId: z.uuid(),
  lotName: z.string(),
  attendantName: z.string().nullable(),
  approved: z.boolean(),
  revoked: z.boolean(),
  lastSeenAt: z.iso.datetime(),
});
export const OperatorDeviceListSchema = z.object({ items: z.array(OperatorDeviceSchema) });
export const DeviceDecisionSchema = z.object({ decision: z.enum(['approve', 'revoke']) });

/** Driver self check-in / check-out (ADR 0016): the scanned entrance code and where the phone is. */
export const SelfCheckRequestSchema = z.object({
  /** The app's idempotency key for this tap: a repeat is the same check-in. */
  clientEventId: z.uuid(),
  code: z.string().max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
/** Owner's switch for a lot, and the text the entrance poster's QR holds. */
export const SelfCheckinSettingSchema = z.object({
  lotId: z.uuid(),
  enabled: z.boolean(),
  gateCode: z.string(),
});
export const SelfCheckinUpdateSchema = z.object({ enabled: z.boolean() });
/** DUPLICATE: the same tap again; CONFLICT: already in (or out) by another route. */
export const SelfCheckResultSchema = z.object({
  result: z.enum(['APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED']),
  reason: z.string().nullable(),
});

/** Portal home: who is in each lot now (doc 03 §2.4 live occupancy). */
export const OccupancySchema = z.object({
  items: z.array(
    z.object({
      lotId: z.uuid(),
      name: z.string(),
      capacityTotal: z.number().int(),
      /** Parkly cars checked in and not yet out. */
      parked: z.number().int(),
      walkIns: z.number().int(),
      /** Paid bookings due in the next 24 h that have not arrived. */
      expected: z.number().int(),
    }),
  ),
});

export type Occupancy = z.infer<typeof OccupancySchema>;
export type SelfCheckinSetting = z.infer<typeof SelfCheckinSettingSchema>;
export type SelfCheckRequest = z.infer<typeof SelfCheckRequestSchema>;
export type SelfCheckResult = z.infer<typeof SelfCheckResultSchema>;
export type ManifestBooking = z.infer<typeof ManifestBookingSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type AttendEvent = z.infer<typeof AttendEventSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncResult = z.infer<typeof SyncResultSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type AttendDevice = z.infer<typeof AttendDeviceSchema>;
export type OperatorDevice = z.infer<typeof OperatorDeviceSchema>;
