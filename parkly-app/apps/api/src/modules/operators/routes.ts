import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateOperatorRequestSchema,
  OperatorSchema,
  UpdateOperatorRequestSchema,
  type Operator,
  type UpdateOperatorRequest,
} from '@parkly/contracts';
import { normaliseNigerianPhone } from '@parkly/domain/phone';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import type { FieldCrypto } from '../../lib/crypto.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp } from '../../middleware/rate-limit.js';
import { OperatorExistsError, type OperatorDetails, type OperatorRow } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const OperatorIdParam = z.object({ operatorId: z.uuid() });
const DEFAULT_COMMISSION_BPS = 1200; // doc 00 §3.9; overridden by fees.commission_bps_default

/** Business details stay editable until KYB is submitted for review. */
const EDITABLE_KYB = new Set<OperatorRow['kybStatus']>(['NOT_STARTED', 'REJECTED']);

/** "rc 123-456" → "RC123456". */
const normaliseCac = (cac: string) => cac.toUpperCase().replace(/[\s-]/g, '');

export function toOperator(row: OperatorRow, crypto: FieldCrypto): Operator {
  const open = (v: string | null) => (v === null ? null : crypto.decrypt(v));
  return {
    id: row.id,
    legalName: row.legalName,
    tradingName: row.tradingName,
    type: row.type,
    cacNumber: open(row.cacNumberEnc),
    tin: open(row.tinEnc),
    addressLine: row.addressLine,
    contactEmail: row.contactEmail,
    contactPhone: open(row.contactPhoneEnc),
    status: row.status,
    kybStatus: row.kybStatus,
    kybSubmittedAt: row.kybSubmittedAt?.toISOString() ?? null,
    kybRejectionReason: row.kybRejectionReason,
    commissionBps: row.commissionBps,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Validates and encrypts the sensitive business fields that were supplied. */
function toStored(input: UpdateOperatorRequest, crypto: FieldCrypto): Partial<OperatorDetails> {
  const out: Partial<OperatorDetails> = {};
  if (input.legalName !== undefined) out.legalName = input.legalName;
  if (input.tradingName !== undefined) out.tradingName = input.tradingName;
  if (input.type !== undefined) out.type = input.type;
  if (input.addressLine !== undefined) out.addressLine = input.addressLine;
  if (input.contactEmail !== undefined) out.contactEmail = input.contactEmail.toLowerCase();
  if (input.cacNumber !== undefined)
    out.cacNumberEnc = crypto.encrypt(normaliseCac(input.cacNumber));
  if (input.tin !== undefined) out.tinEnc = crypto.encrypt(input.tin);
  if (input.contactPhone !== undefined) {
    const e164 = normaliseNigerianPhone(input.contactPhone);
    if (!e164) throw new ApiError('AUTH_PHONE_INVALID');
    out.contactPhoneEnc = crypto.encrypt(e164);
  }
  return out;
}

/** Operator onboarding and business details (FR-LOT-001, doc 02 §6.6). */
export function operatorRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  // O-03: anyone signed in (a new operator has no role yet) can create one; they become OWNER.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators',
      tags: ['operators'],
      ...secured,
      request: { body: { ...json(CreateOperatorRequestSchema), required: true } },
      responses: { 201: { description: 'Operator created', ...json(OperatorSchema) } },
    }),
    async (c) => {
      const actor = c.get('actor');
      authorize(c, deps.logger, 'operator:create', { ownerUserId: actor.userId });
      const { agreementVersion, ...body } = c.req.valid('json');

      const [agreement, privacy, commission] = await Promise.all([
        deps.store.settings.get<string>('legal.operator_agreement_version'),
        deps.store.settings.get<string>('legal.privacy_version'),
        deps.store.settings.get<number>('fees.commission_bps_default'),
      ]);
      if (!agreement || agreementVersion !== agreement)
        throw new ApiError(
          'VALIDATION_FAILED',
          'Accept the current Operator Agreement to continue',
        );

      const stored = toStored(body, deps.crypto) as OperatorDetails;
      let row: OperatorRow;
      try {
        row = await deps.store.operators.create({
          ...stored,
          tinEnc: stored.tinEnc ?? null,
          ownerUserId: actor.userId,
          commissionBps: commission ?? DEFAULT_COMMISSION_BPS,
        });
      } catch (err) {
        if (err instanceof OperatorExistsError) throw new ApiError('OPERATOR_DUPLICATE');
        throw err;
      }

      const ip = clientIp(c.req.header('x-forwarded-for'));
      const ipHash = ip === 'unknown' ? null : deps.crypto.lookupHash(ip);
      await deps.store.consents.add({
        userId: actor.userId,
        type: 'OPERATOR_AGREEMENT',
        version: agreement,
        granted: true,
        ipHash,
      });
      if (privacy)
        await deps.store.consents.add({
          userId: actor.userId,
          type: 'PRIVACY',
          version: privacy,
          granted: true,
          ipHash,
        });
      await audit(c, deps, {
        action: 'operator.created',
        entityType: 'operator',
        entityId: row.id,
      });
      return c.json(toOperator(row, deps.crypto), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}',
      tags: ['operators'],
      ...secured,
      request: { params: OperatorIdParam },
      responses: { 200: { description: 'Operator', ...json(OperatorSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      // Another operator's id looks exactly like one that does not exist.
      authorize(c, deps.logger, 'operator:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const row = await deps.store.operators.find(operatorId);
      if (!row) throw new ApiError('NOT_FOUND');
      return c.json(toOperator(row, deps.crypto), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/operators/{operatorId}',
      tags: ['operators'],
      ...secured,
      request: {
        params: OperatorIdParam,
        body: { ...json(UpdateOperatorRequestSchema), required: true },
      },
      responses: { 200: { description: 'Operator updated', ...json(OperatorSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      authorize(c, deps.logger, 'operator:update', { operatorId });
      const current = await deps.store.operators.find(operatorId);
      if (!current) throw new ApiError('NOT_FOUND');
      if (!EDITABLE_KYB.has(current.kybStatus))
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Business details are locked during KYB review',
        );

      const body = c.req.valid('json');
      const row = await deps.store.operators.update(operatorId, toStored(body, deps.crypto));
      // Field names only: values can be PII or ciphertext (doc 06, audit is retained 7 years).
      await audit(c, deps, {
        action: 'operator.updated',
        entityType: 'operator',
        entityId: operatorId,
        after: { fields: Object.keys(body) },
      });
      return c.json(toOperator(row, deps.crypto), 200);
    },
  );

  return app;
}
