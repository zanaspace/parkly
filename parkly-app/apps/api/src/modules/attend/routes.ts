import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AttendDeviceSchema,
  AttendLotListSchema,
  DeviceDecisionSchema,
  ManifestSchema,
  OccupancySchema,
  SelfCheckinSettingSchema,
  SelfCheckinUpdateSchema,
  SelfCheckRequestSchema,
  SelfCheckResultSchema,
  OperatorDeviceListSchema,
  OperatorDeviceSchema,
  RegisterDeviceRequestSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  type AttendDevice,
  type OperatorDevice,
} from '@parkly/contracts';
import { can } from '@parkly/domain/authz';
import {
  checkSelf,
  distanceM,
  isAttendantGateCode,
  parseGateCode,
  SELF_CHECKIN_RADIUS_M,
} from '@parkly/domain/checkin';
import { toBase64Url } from '@parkly/domain/qr';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { gateCodes } from '../../lib/gate-codes.js';
import { bookingNotice } from '../../notifications/events.js';
import { overstayPricer } from '../bookings/overstay-price.js';
import type { AttendDeviceRow, AttendEventInput, AttendEventResult } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const DAY_MS = 24 * 60 * 60 * 1000;

const toDevice = (d: AttendDeviceRow): AttendDevice => ({
  id: d.id,
  lotId: d.lotId,
  approved: !!d.approvedAt && !d.revokedAt,
  revoked: !!d.revokedAt,
});

/**
 * Attendant app (doc 02 §6.7, ADR 0005): register the phone, download the
 * manifest for 24 h offline, sync queued events. Lot-scoped: attendants see
 * only the lots they work; owners and managers every lot of their operator.
 */
export function attendRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const middleware = [authenticate(deps.verifyToken), loadActor(deps.store)];
  const secured = { security: [{ bearerAuth: [] }], middleware };
  const codes = gateCodes(deps.crypto);

  async function settingNumber(key: string, fallback: number) {
    return (await deps.store.settings.get<number>(key)) ?? fallback;
  }

  /** The lot, if this person may work its gate (404 otherwise: no enumeration). */
  async function gateLot(c: Parameters<typeof authorize>[0], lotId: string) {
    const lot = await deps.store.lots.findById(lotId);
    if (!lot) throw new ApiError('LOT_NOT_FOUND');
    try {
      authorize(
        c,
        deps.logger,
        'lot:checkin',
        { operatorId: lot.operatorId, lotId },
        {
          denyAs: 'NOT_FOUND',
        },
      );
    } catch (err) {
      // Same answer as a lot that does not exist.
      if (err instanceof ApiError && err.code === 'NOT_FOUND') throw new ApiError('LOT_NOT_FOUND');
      throw err;
    }
    return lot;
  }

  /**
   * Overstay is worked out by the server (doc 03 §3.6) from the booking's own
   * plan and overstay terms (ADR 0016, gap review L-3), as the booking view shows.
   */
  async function priceOverstay(_lotId: string, sessionIds: string[]) {
    if (sessionIds.length === 0) return;
    const overstay = overstayPricer(deps.store);
    for (const id of sessionIds) {
      const s = await deps.store.attend.session(id);
      if (!s?.checkOutAt) continue;
      try {
        const notice = await bookingNotice(deps.store, s.bookingId);
        if (!notice) continue;
        const q = await overstay.price(notice.booking, s.checkOutAt);
        if (!q || q.kobo === 0) continue;
        await deps.store.attend.setOverstay(id, q.minutes, q.kobo);
        await deps.notifications.notify({
          key: 'session.overstay_due',
          ...notice.base,
          overstayMinutes: q.minutes,
          amountKobo: q.kobo,
        });
      } catch (err) {
        deps.logger.error({ err, sessionId: id }, 'overstay could not be priced');
      }
    }
  }

  /** FR-NOT-002: tell the driver about each check-in and check-out that was applied. */
  async function notifyGate(events: AttendEventInput[], results: AttendEventResult[]) {
    for (const r of results) {
      if (r.result !== 'APPLIED') continue;
      const e = events.find((x) => x.clientEventId === r.clientEventId);
      if (!e || (e.type !== 'CHECK_IN' && e.type !== 'CHECK_OUT')) continue;
      const notice = await bookingNotice(deps.store, e.bookingId);
      if (!notice) continue;
      const at = e.deviceTime.toISOString();
      await deps.notifications.notify(
        e.type === 'CHECK_IN'
          ? { key: 'session.checked_in', ...notice.base, checkInAt: at }
          : { key: 'session.checked_out', ...notice.base, checkOutAt: at },
      );
    }
  }

  /** The approved, unblocked phone for this lot (doc 05 §4.4). */
  async function approvedDevice(userId: string, clientDeviceId: string, lotId: string) {
    const device = await deps.store.attend.device(userId, clientDeviceId);
    if (device?.revokedAt) throw new ApiError('DEVICE_REVOKED');
    if (!device?.approvedAt || device.lotId !== lotId) throw new ApiError('DEVICE_NOT_APPROVED');
    return device;
  }

  // A-01 lot picker: attendants see the lots they are assigned (all when none
  // are listed); owners and managers every lot of their operator.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/attend/lots',
      tags: ['attend'],
      ...secured,
      responses: {
        200: { description: 'Lots this person may work', ...json(AttendLotListSchema) },
      },
    }),
    async (c) => {
      const actor = c.get('actor');
      const operatorIds = [
        ...new Set(
          actor.roles
            .filter((g) => g.operatorId && g.role.startsWith('OPERATOR_'))
            .map((g) => g.operatorId as string),
        ),
      ];
      const lots = (await Promise.all(operatorIds.map((id) => deps.store.lots.list(id)))).flat();
      const items = lots
        .filter((l) => l.status === 'LIVE' || l.status === 'PAUSED')
        .filter((l) => can(actor, 'lot:checkin', { operatorId: l.operatorId, lotId: l.id }))
        .map((l) => ({ id: l.id, name: l.name, status: l.status }));
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/attend/devices',
      tags: ['attend'],
      ...secured,
      request: { body: { ...json(RegisterDeviceRequestSchema), required: true } },
      responses: { 200: { description: 'This phone for this lot', ...json(AttendDeviceSchema) } },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const lot = await gateLot(c, body.lotId);
      const actor = c.get('actor');
      // Owners' and managers' own phones need no approval; attendants' do.
      const isManager = actor.roles.some(
        (g) =>
          g.operatorId === lot.operatorId &&
          (g.role === 'OPERATOR_OWNER' || g.role === 'OPERATOR_MANAGER'),
      );
      const device = await deps.store.attend.registerDevice({
        userId: actor.userId,
        clientDeviceId: body.clientDeviceId,
        operatorId: lot.operatorId,
        lotId: lot.id,
        approve: isManager,
        at: deps.now(),
      });
      // A manager's own phone approves itself: still a privileged change (Never-do #3).
      if (isManager && device.approvedAt?.getTime() === deps.now().getTime())
        await audit(c, deps, {
          action: 'attendant_device.self_approve',
          entityType: 'device',
          entityId: device.id,
          after: { lotId: lot.id },
        });
      return c.json(toDevice(device), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/attend/lots/{lotId}/manifest',
      tags: ['attend'],
      ...secured,
      request: {
        params: z.object({ lotId: z.uuid() }),
        query: z.object({ clientDeviceId: z.uuid() }),
      },
      responses: { 200: { description: 'Gate data for 24 h offline', ...json(ManifestSchema) } },
    }),
    async (c) => {
      const { lotId } = c.req.valid('param');
      const { clientDeviceId } = c.req.valid('query');
      // Before the role check, so a removed attendant's phone still learns to wipe (G-7).
      if ((await deps.store.attend.device(c.get('actor').userId, clientDeviceId))?.revokedAt)
        throw new ApiError('DEVICE_REVOKED');
      const lot = await gateLot(c, lotId);
      await approvedDevice(c.get('actor').userId, clientDeviceId, lotId);
      const now = deps.now();
      const [rows, keys, walkIns, earlyArrivalMin, noShowGraceMin, overstayGraceMin] =
        await Promise.all([
          deps.store.attend.manifest(
            lotId,
            new Date(now.getTime() - DAY_MS),
            new Date(now.getTime() + DAY_MS),
          ),
          deps.store.lotKeys.forManifest(lotId),
          deps.store.attend.walkIns(lotId),
          settingNumber('booking.early_arrival_min', 30),
          settingNumber('booking.no_show_grace_min', 30),
          settingNumber('session.overstay_grace_min', 10),
        ]);
      return c.json(
        {
          serverTime: now.toISOString(),
          lot: {
            id: lot.id,
            name: lot.name,
            capacityBookable: lot.capacityBookable,
            gateKey: codes.attendantKey(lot.id),
          },
          rules: { earlyArrivalMin, noShowGraceMin, overstayGraceMin },
          keys: keys.valid.map((k) => ({
            kid: k.kid,
            publicKey: toBase64Url(new Uint8Array(k.publicKey)),
            status: k.status === 'RETIRING' ? ('RETIRING' as const) : ('ACTIVE' as const),
          })),
          revokedKids: keys.revokedKids,
          bookings: rows.map((b) => ({
            id: b.id,
            code: b.code,
            plateNorm: b.plateNorm,
            startAt: b.startAt.toISOString(),
            endAt: b.endAt.toISOString(),
            status: b.status,
            checkedInAt: b.checkedInAt?.toISOString() ?? null,
            checkedOutAt: b.checkedOutAt?.toISOString() ?? null,
          })),
          walkIns,
        },
        200,
      );
    },
  );

  // Doc 01 §5.3: idempotent per event (clientEventId) and per batch (batchId).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/attend/sync',
      tags: ['attend'],
      ...secured,
      request: { body: { ...json(SyncRequestSchema), required: true } },
      responses: { 200: { description: 'A verdict per event', ...json(SyncResponseSchema) } },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const actor = c.get('actor');
      const receivedAt = deps.now();
      // A blocked phone, or one whose attendant was removed, is told so before any
      // role check, so it wipes its cache; its queue is kept for ops (G-6, G-7).
      const known = await deps.store.attend.device(actor.userId, body.clientDeviceId);
      const revoked = Boolean(known?.revokedAt);
      const lot = revoked && known ? { id: known.lotId } : await gateLot(c, body.lotId);
      const device =
        revoked && known ? known : await approvedDevice(actor.userId, body.clientDeviceId, lot.id);
      const events: AttendEventInput[] = body.events.map((e) => {
        const deviceTime = new Date(e.deviceTime);
        switch (e.type) {
          case 'CHECK_IN':
            return {
              ...e,
              deviceTime,
              plateSeen: e.plateSeen ?? null,
              overrideReason: e.overrideReason ?? null,
            };
          case 'CHECK_OUT':
            return { ...e, deviceTime };
          case 'WALK_IN':
            return { ...e, deviceTime };
          case 'ISSUE':
            return { ...e, deviceTime, bookingId: e.bookingId ?? null };
        }
      });
      const { results, checkedOut } = await deps.store.attend.applyBatch(
        {
          id: body.batchId,
          deviceId: device.id,
          lotId: lot.id,
          attendantId: actor.userId,
          deviceSentAt: new Date(body.deviceSentAt),
          receivedAt,
          quarantine: revoked,
        },
        events,
      );
      if (revoked) {
        deps.logger.warn(
          { event: 'attend.revoked_sync', deviceId: device.id, events: results.length },
          'blocked phone synced; events kept for review',
        );
        throw new ApiError('DEVICE_REVOKED');
      }

      await notifyGate(events, results);
      await priceOverstay(lot.id, checkedOut);
      deps.logger.info(
        { event: 'attend.synced', lotId: lot.id, events: results.length },
        'attendant sync',
      );
      return c.json({ serverTime: receivedAt.toISOString(), results }, 200);
    },
  );

  // --- self check-in (ADR 0016) --------------------------------------------------

  async function ownLot(
    c: Parameters<typeof authorize>[0],
    operatorId: string,
    lotId: string,
    write: boolean,
  ) {
    authorize(
      c,
      deps.logger,
      write ? 'operator:update' : 'lot:read',
      { operatorId },
      {
        denyAs: 'NOT_FOUND',
      },
    );
    const lot = await deps.store.lots.find(operatorId, lotId);
    if (!lot) throw new ApiError('LOT_NOT_FOUND');
    return lot;
  }

  const lotPath = z.object({ operatorId: z.uuid(), lotId: z.uuid() });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/lots/{lotId}/self-check-in',
      tags: ['operators'],
      ...secured,
      request: { params: lotPath },
      responses: {
        200: {
          description: 'Self check-in switch and poster code',
          ...json(SelfCheckinSettingSchema),
        },
      },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      const lot = await ownLot(c, operatorId, lotId, false);
      return c.json({ lotId, enabled: lot.selfCheckinEnabled, gateCode: codes.poster(lotId) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/lots/{lotId}/self-check-in',
      tags: ['operators'],
      ...secured,
      request: { params: lotPath, body: { ...json(SelfCheckinUpdateSchema), required: true } },
      responses: { 200: { description: 'Switched', ...json(SelfCheckinSettingSchema) } },
    }),
    async (c) => {
      const { operatorId, lotId } = c.req.valid('param');
      await ownLot(c, operatorId, lotId, true);
      const { enabled } = c.req.valid('json');
      const lot = await deps.store.lots.setSelfCheckin(operatorId, lotId, enabled);
      if (!lot) throw new ApiError('LOT_NOT_FOUND');
      await audit(c, deps, {
        action: enabled ? 'lot.self_checkin_on' : 'lot.self_checkin_off',
        entityType: 'lot',
        entityId: lotId,
        after: { selfCheckinEnabled: enabled },
      });
      return c.json({ lotId, enabled, gateCode: codes.poster(lotId) }, 200);
    },
  );

  const SELF_ERRORS = {
    SELF_CHECKIN_OFF: 'SELF_CHECKIN_OFF',
    QR_WRONG_LOT: 'QR_WRONG_LOT',
    TOO_FAR: 'SELF_CHECKIN_TOO_FAR',
    QR_OUTSIDE_WINDOW: 'QR_OUTSIDE_WINDOW',
    BOOKING_NOT_ACTIVE: 'BOOKING_NOT_ACTIVE',
  } as const;

  /** The driver scans the entrance QR to check in, or to check out (doc 01 §5.3 rules apply). */
  async function selfCheck(
    c: Parameters<typeof authorize>[0],
    bookingId: string,
    type: 'CHECK_IN' | 'CHECK_OUT',
  ) {
    const body = SelfCheckRequestSchema.parse(await c.req.json().catch(() => ({})));
    const booking = await deps.store.bookings.find(bookingId);
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');
    try {
      authorize(
        c,
        deps.logger,
        'booking:read:own',
        { ownerUserId: booking.driverId },
        { denyAs: 'NOT_FOUND' },
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND')
        throw new ApiError('BOOKING_NOT_FOUND');
      throw err;
    }
    const lot = await deps.store.lots.findById(booking.lotId);
    if (!lot) throw new ApiError('LOT_NOT_FOUND');
    const now = deps.now();
    // Only a code Parkly signed: the lot id alone, which every booking carries, is not enough.
    if (!codes.verify(body.code, now)) throw new ApiError('QR_WRONG_LOT');
    const stay = (await deps.store.attend.sessionsForBookings([booking.id])).get(booking.id);
    const rules = {
      earlyArrivalMin: await settingNumber('booking.early_arrival_min', 30),
      noShowGraceMin: await settingNumber('booking.no_show_grace_min', 30),
    };
    const check =
      type === 'CHECK_IN'
        ? checkSelf({
            enabled: lot.selfCheckinEnabled,
            code: body.code,
            lotId: lot.id,
            lotLocation: lot.location,
            position: { lat: body.lat, lng: body.lng },
            booking: {
              id: booking.id,
              code: booking.code,
              plateNorm: booking.plateNorm,
              startAt: booking.startAt,
              endAt: booking.endAt,
              status: booking.status,
              checkedInAt: null,
            },
            now,
            rules,
          })
        : !lot.selfCheckinEnabled && !isAttendantGateCode(body.code)
          ? ({ ok: false, code: 'SELF_CHECKIN_OFF' } as const)
          : parseGateCode(body.code) !== lot.id
            ? ({ ok: false, code: 'QR_WRONG_LOT' } as const)
            : distanceM(lot.location, { lat: body.lat, lng: body.lng }) > SELF_CHECKIN_RADIUS_M
              ? ({ ok: false, code: 'TOO_FAR' } as const)
              : !stay?.checkInAt
                ? ({ ok: false, code: 'BOOKING_NOT_ACTIVE' } as const)
                : ({ ok: true } as const);
    if (!check.ok) throw new ApiError(SELF_ERRORS[check.code]);

    const actor = c.get('actor');
    const selfEvent: AttendEventInput =
      type === 'CHECK_IN'
        ? {
            type,
            clientEventId: body.clientEventId,
            deviceTime: now,
            bookingId: booking.id,
            method: 'SELF',
            plateSeen: null,
            overrideReason: null,
          }
        : {
            type,
            clientEventId: body.clientEventId,
            deviceTime: now,
            bookingId: booking.id,
            method: 'SELF',
          };
    const { results, checkedOut } = await deps.store.attend.applyBatch(
      {
        id: crypto.randomUUID(),
        // The driver's own phone is the "device" for a self check-in.
        deviceId: actor.userId,
        lotId: lot.id,
        attendantId: actor.userId,
        deviceSentAt: now,
        receivedAt: now,
      },
      [selfEvent],
    );
    await notifyGate([selfEvent], results);
    await priceOverstay(lot.id, checkedOut);
    const r = results[0];
    deps.logger.info(
      { event: 'attend.self', type, bookingId: booking.id, result: r?.result },
      'self check',
    );
    return { result: r?.result ?? 'REJECTED', reason: r?.reason ?? null };
  }

  const bookingPath = z.object({ id: z.uuid() });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings/{id}/self-check-in',
      tags: ['bookings'],
      ...secured,
      request: { params: bookingPath, body: { ...json(SelfCheckRequestSchema), required: true } },
      responses: {
        200: { description: 'Checked in (or already in)', ...json(SelfCheckResultSchema) },
      },
    }),
    async (c) => c.json(await selfCheck(c, c.req.valid('param').id, 'CHECK_IN'), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/bookings/{id}/self-check-out',
      tags: ['bookings'],
      ...secured,
      request: { params: bookingPath, body: { ...json(SelfCheckRequestSchema), required: true } },
      responses: {
        200: { description: 'Checked out (or already out)', ...json(SelfCheckResultSchema) },
      },
    }),
    async (c) => c.json(await selfCheck(c, c.req.valid('param').id, 'CHECK_OUT'), 200),
  );

  // Portal home: live occupancy for each of the operator's lots (doc 03 §2.4).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/occupancy',
      tags: ['operators'],
      ...secured,
      request: { params: z.object({ operatorId: z.uuid() }) },
      responses: { 200: { description: 'Who is parked now', ...json(OccupancySchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const lots = (await deps.store.lots.list(operatorId)).filter(
        (l) => l.status === 'LIVE' || l.status === 'PAUSED',
      );
      const ids = lots.map((l) => l.id);
      const [counts, walkIns] = await Promise.all([
        deps.store.attend.occupancy(ids, deps.now()),
        Promise.all(ids.map((id) => deps.store.attend.walkIns(id))),
      ]);
      return c.json(
        {
          items: lots.map((l, i) => ({
            lotId: l.id,
            name: l.name,
            capacityTotal: l.capacityTotal,
            parked: counts.get(l.id)?.parked ?? 0,
            walkIns: walkIns[i] ?? 0,
            expected: counts.get(l.id)?.expected ?? 0,
          })),
        },
        200,
      );
    },
  );

  // O-20: the owner's and managers' view of attendant phones.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/devices',
      tags: ['operators'],
      ...secured,
      request: { params: z.object({ operatorId: z.uuid() }) },
      responses: { 200: { description: 'Attendant phones', ...json(OperatorDeviceListSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:members:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const rows = await deps.store.attend.operatorDevices(operatorId);
      const items: OperatorDevice[] = rows.map((d) => ({
        ...toDevice(d),
        lotName: d.lotName,
        attendantName: d.attendantName,
        lastSeenAt: d.lastSeenAt.toISOString(),
      }));
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/devices/{deviceId}',
      tags: ['operators'],
      ...secured,
      request: {
        params: z.object({ operatorId: z.uuid(), deviceId: z.uuid() }),
        body: { ...json(DeviceDecisionSchema), required: true },
      },
      responses: { 200: { description: 'Approved or blocked', ...json(OperatorDeviceSchema) } },
    }),
    async (c) => {
      const { operatorId, deviceId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:members:invite', { operatorId }, { denyAs: 'NOT_FOUND' });
      const { decision } = c.req.valid('json');
      const d = await deps.store.attend.decideDevice({
        operatorId,
        deviceId,
        decision,
        by: c.get('actor').userId,
        at: deps.now(),
      });
      if (!d) throw new ApiError('NOT_FOUND');
      await audit(c, deps, {
        action: decision === 'approve' ? 'attendant_device.approve' : 'attendant_device.revoke',
        entityType: 'device',
        entityId: d.id,
        after: { lotId: d.lotId, approved: decision === 'approve' },
      });
      const row = (await deps.store.attend.operatorDevices(operatorId)).find((x) => x.id === d.id);
      return c.json(
        {
          ...toDevice(d),
          lotName: row?.lotName ?? '',
          attendantName: row?.attendantName ?? null,
          lastSeenAt: d.lastSeenAt.toISOString(),
        },
        200,
      );
    },
  );

  return app;
}
