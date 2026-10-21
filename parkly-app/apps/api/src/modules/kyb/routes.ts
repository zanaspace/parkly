import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  BankListSchema,
  CompleteKybDocumentRequestSchema,
  KybDocumentListSchema,
  KybDocumentSchema,
  OperatorSchema,
  PayoutAccountSchema,
  PresignKybDocumentRequestSchema,
  PresignUploadResponseSchema,
  SetPayoutAccountRequestSchema,
  type KybDocument,
  type PayoutAccount,
} from '@parkly/contracts';
import { accountNameMatches, kybSubmissionGaps } from '@parkly/domain/operator';
import type { Context } from 'hono';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import type { Bank } from '../../providers/index.js';
import type { KybDocumentRow, OperatorRow, PayoutAccountRow } from '../../store/types.js';
import { toOperator } from '../operators/routes.js';
import { completeUpload, presignUpload } from '../uploads/service.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const OperatorIdParam = z.object({ operatorId: z.uuid() });
const MAX_KYB_DOCUMENTS = 10;
const EDITABLE_KYB = new Set<OperatorRow['kybStatus']>(['NOT_STARTED', 'REJECTED']);
const BANK_CACHE_MS = 60 * 60 * 1000;

const toDocument = (d: KybDocumentRow & { mime: string; sizeBytes: number }): KybDocument => ({
  id: d.id,
  type: d.type,
  status: d.status,
  mime: d.mime,
  sizeBytes: d.sizeBytes,
  uploadedAt: d.createdAt.toISOString(),
  rejectionReason: d.rejectionReason,
});

const toPayout = (p: PayoutAccountRow): PayoutAccount => ({
  bankCode: p.bankCode,
  bankName: p.bankName,
  accountNumberLast4: p.accountNumberLast4,
  accountName: p.accountName,
  nameMatchesLegalName: !p.nameMismatch,
  status: p.status,
});

/** KYB documents, payout account and KYB submission (FR-LOT-001, doc 02 §6.6). */
export function kybRoutes(deps: AppDeps) {
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

  let bankCache: { at: number; banks: Bank[] } | null = null;
  async function banks(): Promise<Bank[]> {
    const now = deps.now().getTime();
    if (bankCache && now - bankCache.at < BANK_CACHE_MS) return bankCache.banks;
    try {
      bankCache = { at: now, banks: await deps.settlement.listBanks() };
    } catch {
      throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
    }
    return bankCache.banks;
  }

  /** Same-tenant check first (404 hides other operators), then the owner-only rule. */
  async function ownerOperator(c: Context<AuthEnv>, operatorId: string, opts = { editable: true }) {
    authorize(c, deps.logger, 'operator:kyb:read', { operatorId }, { denyAs: 'NOT_FOUND' });
    authorize(c, deps.logger, 'operator:kyb:manage', { operatorId });
    const operator = await deps.store.operators.find(operatorId);
    if (!operator) throw new ApiError('NOT_FOUND');
    if (opts.editable && !EDITABLE_KYB.has(operator.kybStatus))
      throw new ApiError('INVALID_STATE_TRANSITION', 'KYB has been submitted');
    return operator;
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/banks',
      tags: ['kyb'],
      ...secured,
      responses: { 200: { description: 'Nigerian banks', ...json(BankListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'bank:list', {});
      return c.json({ items: await banks() }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/kyb-documents',
      tags: ['kyb'],
      ...secured,
      request: { params: OperatorIdParam },
      responses: { 200: { description: 'KYB documents', ...json(KybDocumentListSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:kyb:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const docs = await deps.store.kybDocuments.list(operatorId);
      return c.json({ items: docs.map(toDocument) }, 200);
    },
  );

  // Step 1: signed upload URL into the private kyb-docs bucket (doc 05 V12).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/kyb-documents',
      tags: ['kyb'],
      ...secured,
      request: {
        params: OperatorIdParam,
        body: { ...json(PresignKybDocumentRequestSchema), required: true },
      },
      responses: { 201: { description: 'Upload URL', ...json(PresignUploadResponseSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      await ownerOperator(c, operatorId);
      if ((await deps.store.kybDocuments.list(operatorId)).length >= MAX_KYB_DOCUMENTS)
        throw new ApiError('VALIDATION_FAILED', `At most ${MAX_KYB_DOCUMENTS} KYB documents`);
      const body = c.req.valid('json');
      const res = await presignUpload(uploadDeps, {
        purpose: 'KYB_DOCUMENT',
        owner: { type: 'operator', id: operatorId },
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

  // Step 2: after the browser uploaded, re-check the bytes and record the document.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/kyb-documents/{fileId}/complete',
      tags: ['kyb'],
      ...secured,
      request: {
        params: OperatorIdParam.extend({ fileId: z.uuid() }),
        body: { ...json(CompleteKybDocumentRequestSchema), required: true },
      },
      responses: { 201: { description: 'Document recorded', ...json(KybDocumentSchema) } },
    }),
    async (c) => {
      const { operatorId, fileId } = c.req.valid('param');
      await ownerOperator(c, operatorId);
      const { type } = c.req.valid('json');

      const existing = (await deps.store.kybDocuments.list(operatorId)).find(
        (d) => d.fileId === fileId,
      );
      if (existing) return c.json(toDocument(existing), 201);

      const res = await completeUpload(uploadDeps, {
        fileId,
        purpose: 'KYB_DOCUMENT',
        owner: { type: 'operator', id: operatorId },
      });
      if (!res.ok) {
        if (res.reason === 'NOT_FOUND') throw new ApiError('NOT_FOUND');
        if (res.reason === 'NOT_UPLOADED') throw new ApiError('UPLOAD_NOT_RECEIVED');
        throw new ApiError('UPLOAD_REJECTED', res.reason);
      }
      const doc = await deps.store.kybDocuments.create({ operatorId, type, fileId });
      await audit(c, deps, {
        action: 'operator.kyb_document_added',
        entityType: 'operator',
        entityId: operatorId,
        after: { documentId: doc.id, type },
      });
      return c.json(
        toDocument({ ...doc, mime: res.file.mime, sizeBytes: res.file.sizeBytes }),
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/operators/{operatorId}/kyb-documents/{documentId}',
      tags: ['kyb'],
      ...secured,
      request: { params: OperatorIdParam.extend({ documentId: z.uuid() }) },
      responses: { 204: { description: 'Document removed' } },
    }),
    async (c) => {
      const { operatorId, documentId } = c.req.valid('param');
      await ownerOperator(c, operatorId);
      const doc = await deps.store.kybDocuments.find(operatorId, documentId);
      if (!doc) throw new ApiError('NOT_FOUND');
      const file = await deps.store.files.find(doc.fileId);
      if (file) await deps.storage.remove({ bucket: file.bucket, paths: [file.path] });
      await deps.store.kybDocuments.remove(operatorId, documentId);
      await audit(c, deps, {
        action: 'operator.kyb_document_removed',
        entityType: 'operator',
        entityId: operatorId,
        after: { documentId, type: doc.type },
      });
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/operators/{operatorId}/payout-account',
      tags: ['kyb'],
      ...secured,
      request: { params: OperatorIdParam },
      responses: {
        200: {
          description: 'Payout account, if set',
          ...json(z.object({ account: PayoutAccountSchema.nullable() })),
        },
      },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      authorize(c, deps.logger, 'operator:kyb:read', { operatorId }, { denyAs: 'NOT_FOUND' });
      const row = await deps.store.payoutAccounts.find(operatorId);
      return c.json({ account: row ? toPayout(row) : null }, 200);
    },
  );

  // O-05: resolve the name with the provider; the subaccount is created on KYB approval.
  app.openapi(
    createRoute({
      method: 'put',
      path: '/operators/{operatorId}/payout-account',
      tags: ['kyb'],
      ...secured,
      request: {
        params: OperatorIdParam,
        body: { ...json(SetPayoutAccountRequestSchema), required: true },
      },
      responses: { 200: { description: 'Payout account', ...json(PayoutAccountSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      const operator = await ownerOperator(c, operatorId);
      const { bankCode, accountNumber } = c.req.valid('json');
      const bank = (await banks()).find((b) => b.code === bankCode);
      if (!bank)
        throw new ApiError('VALIDATION_FAILED', 'Unknown bank', {
          errors: [{ path: 'bankCode', message: 'Choose your bank from the list' }],
        });

      let resolved: { accountName: string } | null;
      try {
        resolved = await deps.settlement.resolveAccount({ bankCode, accountNumber });
      } catch {
        throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
      }
      if (!resolved) throw new ApiError('PAYOUT_ACCOUNT_UNRESOLVED');

      const row = await deps.store.payoutAccounts.upsert({
        operatorId,
        bankCode,
        bankName: bank.name,
        accountNumberLast4: accountNumber.slice(-4),
        accountName: resolved.accountName,
        pendingAccountNumberEnc: deps.crypto.encrypt(accountNumber),
        nameMismatch: !accountNameMatches(resolved.accountName, operator.legalName),
        verifiedAt: deps.now(),
      });
      // Masked only: the full number never goes into the audit log (doc 06 §3.5).
      await audit(c, deps, {
        action: 'operator.payout_account_set',
        entityType: 'operator',
        entityId: operatorId,
        after: {
          bankCode,
          accountNumberLast4: row.accountNumberLast4,
          nameMismatch: row.nameMismatch,
        },
      });
      return c.json(toPayout(row), 200);
    },
  );

  // O-06: submit for review; details, documents and bank are then locked.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/operators/{operatorId}/kyb/submit',
      tags: ['kyb'],
      ...secured,
      request: { params: OperatorIdParam },
      responses: { 200: { description: 'KYB submitted', ...json(OperatorSchema) } },
    }),
    async (c) => {
      const { operatorId } = c.req.valid('param');
      const operator = await ownerOperator(c, operatorId);
      const [docs, payout] = await Promise.all([
        deps.store.kybDocuments.list(operatorId),
        deps.store.payoutAccounts.find(operatorId),
      ]);
      const gaps = kybSubmissionGaps({
        kybStatus: operator.kybStatus,
        businessDetailsComplete: !!(
          operator.cacNumberEnc &&
          operator.addressLine &&
          operator.contactEmail &&
          operator.contactPhoneEnc
        ),
        verifiedDocumentTypes: docs.filter((d) => d.fileStatus === 'VERIFIED').map((d) => d.type),
        payoutAccountVerified: payout?.status === 'VERIFIED' || payout?.status === 'ACTIVE',
      });
      if (gaps.length > 0)
        throw new ApiError('KYB_INCOMPLETE', 'Some KYB items are missing', {
          errors: gaps.map((g) => ({ path: g, message: g })),
        });

      const row = await deps.store.operators.submitKyb(operatorId, deps.now());
      await audit(c, deps, {
        action: 'operator.kyb_submitted',
        entityType: 'operator',
        entityId: operatorId,
      });
      return c.json(toOperator(row, deps.crypto), 200);
    },
  );

  return app;
}
