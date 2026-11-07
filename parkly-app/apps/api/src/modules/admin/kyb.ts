import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AdminOperatorDetailSchema,
  AdminOperatorListQuerySchema,
  AdminOperatorListSchema,
  KybReviewRequestSchema,
  OperatorSchema,
  SignedUrlSchema,
  SetCommissionRequestSchema,
  CommissionRateListSchema,
} from '@parkly/contracts';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { isAllowedCommission } from '@parkly/domain/booking';
import { ApiError } from '../../lib/errors.js';
import { StaleVersionError } from '../../store/types.js';
import { toOperator } from '../operators/routes.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const OperatorIdParam = z.object({ operatorId: z.uuid() });
/** Doc 06 §2: links to C4 files (KYB documents) live at most 5 minutes. */
const C4_LINK_SECONDS = 300;

/** X-05 KYB review for Parkly staff (FR-ADM-001, doc 02 §6.8). Every action is audited. */
export function adminKybRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/operators',
      tags: ['admin'],
      ...secured,
      request: { query: AdminOperatorListQuerySchema },
      responses: { 200: { description: 'KYB queue', ...json(AdminOperatorListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'kyb:review', {});
      const { kybStatus } = c.req.valid('query');
      const rows = await deps.store.operators.list({ kybStatus });
      const items = await Promise.all(
        rows.map(async (o) => {
          const payout = await deps.store.payoutAccounts.find(o.id);
          return {
            id: o.id,
            legalName: o.legalName,
            tradingName: o.tradingName,
            type: o.type,
            kybStatus: o.kybStatus,
            kybSubmittedAt: o.kybSubmittedAt?.toISOString() ?? null,
            payoutNameMismatch: payout ? payout.nameMismatch : null,
          };
        }),
      );
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/operators/{operatorId}',
      tags: ['admin'],
      ...secured,
      request: { params: OperatorIdParam },
      responses: {
        200: { description: 'Operator for review', ...json(AdminOperatorDetailSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'kyb:review', {});
      const { operatorId } = c.req.valid('param');
      const operator = await deps.store.operators.find(operatorId);
      if (!operator) throw new ApiError('NOT_FOUND');
      const [docs, payout, members] = await Promise.all([
        deps.store.kybDocuments.list(operatorId),
        deps.store.payoutAccounts.find(operatorId),
        deps.store.operators.members(operatorId),
      ]);
      const ownerId = members.find((m) => m.role === 'OPERATOR_OWNER')?.userId;
      const owner = ownerId ? await deps.store.users.find(ownerId) : null;
      // Decrypted CAC, TIN and phone are personal/business data: record who looked (doc 05).
      await audit(c, deps, {
        action: 'operator.kyb_viewed',
        entityType: 'operator',
        entityId: operatorId,
      });
      return c.json(
        {
          operator: toOperator(operator, deps.crypto),
          documents: docs.map((d) => ({
            id: d.id,
            type: d.type,
            status: d.status,
            mime: d.mime,
            sizeBytes: d.sizeBytes,
            uploadedAt: d.createdAt.toISOString(),
            rejectionReason: d.rejectionReason,
          })),
          payoutAccount: payout
            ? {
                bankCode: payout.bankCode,
                bankName: payout.bankName,
                accountNumberLast4: payout.accountNumberLast4,
                accountName: payout.accountName,
                nameMatchesLegalName: !payout.nameMismatch,
                status: payout.status,
              }
            : null,
          owner: owner ? { firstName: owner.firstName, lastName: owner.lastName } : null,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/operators/{operatorId}/kyb-documents/{documentId}/url',
      tags: ['admin'],
      ...secured,
      request: { params: OperatorIdParam.extend({ documentId: z.uuid() }) },
      responses: { 200: { description: 'Short-lived link', ...json(SignedUrlSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'kyb:review', {});
      const { operatorId, documentId } = c.req.valid('param');
      const doc = await deps.store.kybDocuments.find(operatorId, documentId);
      const file = doc ? await deps.store.files.find(doc.fileId) : null;
      if (!doc || !file || file.status !== 'VERIFIED') throw new ApiError('NOT_FOUND');
      const url = await deps.storage.createSignedDownloadUrl({
        bucket: file.bucket,
        path: file.path,
        expiresInSec: C4_LINK_SECONDS,
      });
      await audit(c, deps, {
        action: 'operator.kyb_document_viewed',
        entityType: 'operator',
        entityId: operatorId,
        after: { documentId, type: doc.type },
      });
      return c.json({ url, expiresInSec: C4_LINK_SECONDS }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/operators/{operatorId}/kyb/review',
      tags: ['admin'],
      ...secured,
      request: {
        params: OperatorIdParam,
        body: { ...json(KybReviewRequestSchema), required: true },
      },
      responses: { 200: { description: 'Reviewed operator', ...json(OperatorSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'kyb:review', {});
      const { operatorId } = c.req.valid('param');
      const review = c.req.valid('json');
      const operator = await deps.store.operators.find(operatorId);
      if (!operator) throw new ApiError('NOT_FOUND');
      if (operator.kybStatus !== 'SUBMITTED')
        throw new ApiError('INVALID_STATE_TRANSITION', 'KYB is not awaiting review');
      const reviewer = { reviewerId: c.get('actor').userId, at: deps.now() };

      try {
        if (review.decision === 'REJECT') {
          const row = await deps.store.operators.rejectKyb(operatorId, {
            ...reviewer,
            reason: review.reason,
          });
          await audit(c, deps, {
            action: 'operator.kyb_rejected',
            entityType: 'operator',
            entityId: operatorId,
            after: { reason: review.reason },
          });
          return c.json(toOperator(row, deps.crypto), 200);
        }

        const payout = await deps.store.payoutAccounts.find(operatorId);
        if (!payout) throw new ApiError('INVALID_STATE_TRANSITION', 'No payout account');
        // Create the subaccount once: a retry after a failure reuses the saved code.
        if (!payout.providerSubaccountCode) {
          if (!payout.pendingAccountNumberEnc)
            throw new ApiError('INVALID_STATE_TRANSITION', 'The bank account must be re-entered');
          let code: string;
          try {
            ({ subaccountCode: code } = await deps.settlement.createSubaccount({
              businessName: operator.legalName,
              bankCode: payout.bankCode,
              accountNumber: deps.crypto.decrypt(payout.pendingAccountNumberEnc),
              percentageCharge: operator.commissionBps / 100,
              contactEmail: operator.contactEmail,
            }));
          } catch {
            throw new ApiError('PAYMENT_PROVIDER_UNAVAILABLE');
          }
          await deps.store.payoutAccounts.setSubaccount(operatorId, code);
        }
        const row = await deps.store.operators.approveKyb(operatorId, reviewer);
        // The subaccount code is C4 (doc 06 §3.5), so it stays out of the audit log.
        await audit(c, deps, {
          action: 'operator.kyb_approved',
          entityType: 'operator',
          entityId: operatorId,
          after: { status: 'ACTIVE', payoutAccount: 'ACTIVE' },
        });
        return c.json(toOperator(row, deps.crypto), 200);
      } catch (err) {
        if (err instanceof StaleVersionError)
          throw new ApiError('INVALID_STATE_TRANSITION', 'KYB was reviewed by someone else');
        throw err;
      }
    },
  );

  // Every operator's current rate, for finance (no personal data, so not audited).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/commission-rates',
      tags: ['admin'],
      ...secured,
      responses: {
        200: { description: 'Operators and their rates', ...json(CommissionRateListSchema) },
      },
    }),
    async (c) => {
      authorize(c, deps.logger, 'operator:commission:set', {});
      const rows = await deps.store.operators.list({});
      const items = rows
        .map((o) => ({
          operatorId: o.id,
          tradingName: o.tradingName,
          legalName: o.legalName,
          kybStatus: o.kybStatus,
          commissionBps: o.commissionBps,
        }))
        .sort((a, b) => a.tradingName.localeCompare(b.tradingName));
      return c.json({ items }, 200);
    },
  );

  // Change an operator's commission: new bookings only, reason audited.
  app.openapi(
    createRoute({
      method: 'put',
      path: '/admin/operators/{operatorId}/commission',
      tags: ['admin'],
      ...secured,
      request: {
        params: OperatorIdParam,
        body: { ...json(SetCommissionRequestSchema), required: true },
      },
      responses: { 200: { description: 'Operator with the new rate', ...json(OperatorSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'operator:commission:set', {});
      const { operatorId } = c.req.valid('param');
      const { commissionBps, reason } = c.req.valid('json');
      if (!isAllowedCommission(commissionBps))
        throw new ApiError('VALIDATION_FAILED', 'Commission must be 10–15%.');
      const before = await deps.store.operators.find(operatorId);
      if (!before) throw new ApiError('NOT_FOUND');
      if (before.commissionBps === commissionBps)
        throw new ApiError('VALIDATION_FAILED', "That is already this operator's rate.");
      const row = await deps.store.operators.setCommission(operatorId, commissionBps);
      if (!row) throw new ApiError('NOT_FOUND');
      await audit(c, deps, {
        action: 'operator.commission_changed',
        entityType: 'operator',
        entityId: operatorId,
        before: { commissionBps: before.commissionBps },
        after: { commissionBps, reason },
      });
      return c.json(toOperator(row, deps.crypto), 200);
    },
  );

  return app;
}
