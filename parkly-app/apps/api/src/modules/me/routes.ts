import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ConsentRequestSchema,
  CreateVehicleRequestSchema,
  DeletionRequestResponseSchema,
  DeviceRequestSchema,
  MeSchema,
  UpdateMeRequestSchema,
  UpdateVehicleRequestSchema,
  VehicleListSchema,
  VehicleSchema,
  type Vehicle,
} from '@parkly/contracts';
import { isValidPlate, normalisePlate } from '@parkly/domain/plate';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp } from '../../middleware/rate-limit.js';
import { DsrAlreadyOpenError, DuplicatePlateError, type VehicleRow } from '../../store/types.js';
import { buildMe } from './me.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const MAX_VEHICLES = 5;
const DSR_DUE_DAYS = 30; // NDPA response window (doc 06)

const toVehicle = (v: VehicleRow): Vehicle => ({
  id: v.id,
  plate: v.plateRaw,
  plateNorm: v.plateNorm,
  make: v.make,
  model: v.model,
  colour: v.colour,
  isDefault: v.isDefault,
});

const VehicleIdParam = z.object({ id: z.uuid() });

export function meRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const middleware = [authenticate(deps.verifyToken), loadActor(deps.store)];
  const secured = { security: [{ bearerAuth: [] }], middleware };
  const own = (c: { get(k: 'actor'): { userId: string } }) => ({
    ownerUserId: c.get('actor').userId,
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags: ['me'],
      ...secured,
      responses: { 200: { description: 'Profile', ...json(MeSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'profile:read:own', own(c));
      const actor = c.get('actor');
      return c.json(await buildMe(deps.store, c.get('user'), actor.roles), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/me',
      tags: ['me'],
      ...secured,
      request: { body: { ...json(UpdateMeRequestSchema), required: true } },
      responses: { 200: { description: 'Updated profile', ...json(MeSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'profile:update:own', own(c));
      const actor = c.get('actor');
      const user = await deps.store.users.updateProfile(actor.userId, c.req.valid('json'));
      return c.json(await buildMe(deps.store, user, actor.roles), 200);
    },
  );

  // FR-AUTH-002: append-only consent history; marketing mirrors onto the profile.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/me/consents',
      tags: ['me'],
      ...secured,
      request: { body: { ...json(ConsentRequestSchema), required: true } },
      responses: { 200: { description: 'Updated profile', ...json(MeSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'consent:write:own', own(c));
      const actor = c.get('actor');
      const consent = c.req.valid('json');
      const ip = clientIp(c.req.header('x-forwarded-for'));
      await deps.store.consents.add({
        userId: actor.userId,
        ...consent,
        ipHash: ip === 'unknown' ? null : deps.crypto.lookupHash(ip),
      });
      if (consent.type === 'MARKETING')
        await deps.store.users.setMarketingOptIn(actor.userId, consent.granted);
      const user = (await deps.store.users.find(actor.userId)) ?? c.get('user');
      return c.json(await buildMe(deps.store, user, actor.roles), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/me/devices',
      tags: ['me'],
      ...secured,
      request: { body: { ...json(DeviceRequestSchema), required: true } },
      responses: { 204: { description: 'Device registered' } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'device:register:own', own(c));
      const body = c.req.valid('json');
      await deps.store.devices.upsert({
        userId: c.get('actor').userId,
        clientDeviceId: body.deviceId,
        platform: body.platform,
        appVersion: body.appVersion ?? null,
        authSessionId: c.get('identity').sessionId,
        // Push tokens are C3 [enc]: stored encrypted (doc 02 §2.2).
        ...(body.pushToken ? { pushTokenEnc: deps.crypto.encrypt(body.pushToken) } : {}),
      });
      return c.body(null, 204);
    },
  );

  // FR-AUTH-007: request deletion. Processing (pseudonymisation) is Sprint 8.
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/me',
      tags: ['me'],
      ...secured,
      responses: {
        202: { description: 'Deletion requested', ...json(DeletionRequestResponseSchema) },
      },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'account:delete:own', own(c));
      // TODO(S4): block with ACCOUNT_HAS_OBLIGATIONS while bookings are active or overstay is unpaid.
      let request: { id: string };
      try {
        const dueAt = new Date(deps.now().getTime() + DSR_DUE_DAYS * 24 * 60 * 60 * 1000);
        request = await deps.store.dataRequests.createDeletion(actor.userId, dueAt);
      } catch (err) {
        if (err instanceof DsrAlreadyOpenError) throw new ApiError('DSR_ALREADY_OPEN');
        throw err;
      }
      await deps.store.users.setStatus(actor.userId, 'PENDING_DELETION');
      await audit(c, deps, {
        action: 'user.deletion_requested',
        entityType: 'user',
        entityId: actor.userId,
      });
      return c.json({ requestId: request.id, status: 'PENDING_DELETION' as const }, 202);
    },
  );

  // --- vehicles (FR-AUTH-003) ---------------------------------------------

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me/vehicles',
      tags: ['vehicles'],
      ...secured,
      responses: { 200: { description: 'Vehicles', ...json(VehicleListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'vehicle:manage:own', own(c));
      const rows = await deps.store.vehicles.list(c.get('actor').userId);
      return c.json({ items: rows.map(toVehicle) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/me/vehicles',
      tags: ['vehicles'],
      ...secured,
      request: { body: { ...json(CreateVehicleRequestSchema), required: true } },
      responses: { 201: { description: 'Vehicle added', ...json(VehicleSchema) } },
    }),
    async (c) => {
      const userId = c.get('actor').userId;
      authorize(c, deps.logger, 'vehicle:manage:own', { ownerUserId: userId });
      const body = c.req.valid('json');
      if (!isValidPlate(body.plate)) throw new ApiError('PLATE_INVALID');

      const existing = await deps.store.vehicles.list(userId);
      if (existing.length >= MAX_VEHICLES) throw new ApiError('VEHICLE_LIMIT_REACHED');
      try {
        const created = await deps.store.vehicles.create({
          userId,
          plateRaw: body.plate,
          plateNorm: normalisePlate(body.plate),
          make: body.make ?? null,
          model: body.model ?? null,
          colour: body.colour ?? null,
          // The first vehicle is always the default.
          isDefault: existing.length === 0 || body.isDefault === true,
        });
        return c.json(toVehicle(created), 201);
      } catch (err) {
        if (err instanceof DuplicatePlateError) throw new ApiError('VEHICLE_DUPLICATE');
        throw err;
      }
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/me/vehicles/{id}',
      tags: ['vehicles'],
      ...secured,
      request: {
        params: VehicleIdParam,
        body: { ...json(UpdateVehicleRequestSchema), required: true },
      },
      responses: { 200: { description: 'Vehicle updated', ...json(VehicleSchema) } },
    }),
    async (c) => {
      const userId = c.get('actor').userId;
      authorize(c, deps.logger, 'vehicle:manage:own', { ownerUserId: userId });
      const { id } = c.req.valid('param');
      if (!(await deps.store.vehicles.find(userId, id))) throw new ApiError('NOT_FOUND');
      const { isDefault, ...details } = c.req.valid('json');
      if (Object.keys(details).length > 0) await deps.store.vehicles.update(userId, id, details);
      if (isDefault) await deps.store.vehicles.setDefault(userId, id);
      const updated = await deps.store.vehicles.find(userId, id);
      if (!updated) throw new ApiError('NOT_FOUND');
      return c.json(toVehicle(updated), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/me/vehicles/{id}',
      tags: ['vehicles'],
      ...secured,
      request: { params: VehicleIdParam },
      responses: { 204: { description: 'Vehicle removed' } },
    }),
    async (c) => {
      const userId = c.get('actor').userId;
      authorize(c, deps.logger, 'vehicle:manage:own', { ownerUserId: userId });
      const { id } = c.req.valid('param');
      if (!(await deps.store.vehicles.find(userId, id))) throw new ApiError('NOT_FOUND');
      // TODO(S4): VEHICLE_IN_USE while the vehicle has an active booking or pass.
      await deps.store.vehicles.remove(userId, id);
      return c.body(null, 204);
    },
  );

  return app;
}
