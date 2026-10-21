import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pdf = (label: string) => new Uint8Array(Buffer.from(`%PDF-1.7\n${label}\n%%EOF`));

/** Drives an operator through the real endpoints up to "KYB submitted". */
async function submittedOperator() {
  const w = world();
  const owner = w.user([], 'Ada');
  const as = (who: string) => ({ as: who, aal: 'aal2' as const });
  const op = await w.call('POST', '/v1/operators', {
    as: owner,
    body: {
      legalName: 'Eko Parking Services Ltd',
      tradingName: 'Eko Parking',
      type: 'COMMERCIAL_LOT',
      cacNumber: 'RC 123456',
      addressLine: '12 Adetokunbo Ademola St, Victoria Island',
      contactEmail: 'ops@ekoparking.ng',
      contactPhone: '08031234567',
      agreementVersion: '2026-10-01',
    },
  });
  const operatorId = op.body?.id as string;
  for (const type of ['CAC_CERT', 'DIRECTOR_ID', 'UTILITY_BILL']) {
    const bytes = pdf(type);
    const presign = await w.call('POST', `/v1/operators/${operatorId}/kyb-documents`, {
      ...as(owner),
      body: { type, contentType: 'application/pdf', sizeBytes: bytes.length, sha256: sha(bytes) },
    });
    const file = await w.store.files.find(presign.body?.fileId as string);
    if (file) w.storage.put(file.bucket, file.path, bytes);
    await w.call(
      'POST',
      `/v1/operators/${operatorId}/kyb-documents/${presign.body?.fileId as string}/complete`,
      { ...as(owner), body: { type } },
    );
  }
  await w.call('PUT', `/v1/operators/${operatorId}/payout-account`, {
    ...as(owner),
    body: { bankCode: '058', accountNumber: '0123456789' },
  });
  await w.call('POST', `/v1/operators/${operatorId}/kyb/submit`, as(owner));
  const ops = w.user([{ role: 'ADMIN_OPS', operatorId: null }], 'Ola');
  return { w, owner, ops, operatorId, as };
}

describe('KYB review queue and detail (FR-ADM-001, doc 03 §4)', () => {
  it('lists submitted operators, oldest first, with the bank-name flag', async () => {
    const ctx = await submittedOperator();
    const res = await ctx.w.call('GET', '/v1/admin/operators?kybStatus=SUBMITTED', ctx.as(ctx.ops));
    expect(res.status).toBe(200);
    expect(res.body?.items).toEqual([
      expect.objectContaining({
        id: ctx.operatorId,
        legalName: 'Eko Parking Services Ltd',
        kybStatus: 'SUBMITTED',
        payoutNameMismatch: false,
      }),
    ]);
  });

  it('shows the decrypted details, documents and masked bank account, and audits the view', async () => {
    const ctx = await submittedOperator();
    const res = await ctx.w.call('GET', `/v1/admin/operators/${ctx.operatorId}`, ctx.as(ctx.ops));
    expect(res.body?.operator).toMatchObject({
      cacNumber: 'RC123456',
      contactPhone: '+2348031234567',
    });
    expect((res.body?.documents as { type: string }[]).map((d) => d.type).sort()).toEqual([
      'CAC_CERT',
      'DIRECTOR_ID',
      'UTILITY_BILL',
    ]);
    expect(res.body?.payoutAccount).toMatchObject({ accountNumberLast4: '6789' });
    expect(JSON.stringify(res.body)).not.toContain('0123456789');
    expect(res.body?.owner).toEqual({ firstName: 'Ada', lastName: null });
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({
      action: 'operator.kyb_viewed',
      actorUserId: ctx.ops,
    });
  });

  it('opens a document through a 5-minute link, audited; another operator’s document is 404', async () => {
    const ctx = await submittedOperator();
    const doc = ctx.w.store.kybDocRows[0];
    const res = await ctx.w.call(
      'GET',
      `/v1/admin/operators/${ctx.operatorId}/kyb-documents/${doc?.id ?? ''}/url`,
      ctx.as(ctx.ops),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ expiresInSec: 300 });
    expect(res.body?.url).toMatch(/kyb-docs\/operator\//);
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'operator.kyb_document_viewed' });
    const other = await ctx.w.call(
      'GET',
      `/v1/admin/operators/${randomUUID()}/kyb-documents/${doc?.id ?? ''}/url`,
      ctx.as(ctx.ops),
    );
    expect(other.status).toBe(404);
  });
});

describe('approve KYB', () => {
  it('creates the Paystack subaccount, activates the operator and erases the full account number', async () => {
    const ctx = await submittedOperator();
    const res = await ctx.w.call('POST', `/v1/admin/operators/${ctx.operatorId}/kyb/review`, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kybStatus: 'APPROVED', status: 'ACTIVE' });
    expect(ctx.w.settlement.subaccounts).toEqual([
      {
        businessName: 'Eko Parking Services Ltd',
        bankCode: '058',
        accountNumber: '0123456789',
        percentageCharge: 12,
        contactEmail: 'ops@ekoparking.ng',
      },
    ]);
    expect(ctx.w.store.payoutRows.get(ctx.operatorId)).toMatchObject({
      status: 'ACTIVE',
      providerSubaccountCode: 'ACCT_fake1',
      pendingAccountNumberEnc: null,
    });
    const audit = ctx.w.store.auditRows.find((a) => a.action === 'operator.kyb_approved');
    expect(audit).toMatchObject({ actorUserId: ctx.ops, entityId: ctx.operatorId });
    expect(JSON.stringify(ctx.w.store.auditRows)).not.toContain('ACCT_fake1');

    const again = await ctx.w.call('POST', `/v1/admin/operators/${ctx.operatorId}/kyb/review`, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect([again.status, again.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });

  it('reuses a subaccount saved by an earlier attempt instead of creating a second one', async () => {
    const ctx = await submittedOperator();
    await ctx.w.store.payoutAccounts.setSubaccount(ctx.operatorId, 'ACCT_from_first_try');
    await ctx.w.call('POST', `/v1/admin/operators/${ctx.operatorId}/kyb/review`, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect(ctx.w.settlement.subaccounts).toEqual([]);
    expect(ctx.w.store.payoutRows.get(ctx.operatorId)?.providerSubaccountCode).toBe(
      'ACCT_from_first_try',
    );
  });

  it('leaves KYB submitted when Paystack is down', async () => {
    const ctx = await submittedOperator();
    ctx.w.settlement.failNext = true;
    const res = await ctx.w.call('POST', `/v1/admin/operators/${ctx.operatorId}/kyb/review`, {
      ...ctx.as(ctx.ops),
      body: { decision: 'APPROVE' },
    });
    expect([res.status, res.body?.code]).toEqual([502, 'PAYMENT_PROVIDER_UNAVAILABLE']);
    expect(ctx.w.store.operatorRows.get(ctx.operatorId)?.kybStatus).toBe('SUBMITTED');
  });
});

describe('reject KYB', () => {
  it('needs a reason, which the owner then sees; the owner can fix it and resubmit', async () => {
    const ctx = await submittedOperator();
    const url = `/v1/admin/operators/${ctx.operatorId}/kyb/review`;
    const noReason = await ctx.w.call('POST', url, {
      ...ctx.as(ctx.ops),
      body: { decision: 'REJECT' },
    });
    expect(noReason.status).toBe(400);

    const res = await ctx.w.call('POST', url, {
      ...ctx.as(ctx.ops),
      body: {
        decision: 'REJECT',
        reason: 'The CAC certificate is unreadable; upload a clearer scan.',
      },
    });
    expect(res.body).toMatchObject({ kybStatus: 'REJECTED' });
    expect(ctx.w.store.auditRows.at(-1)).toMatchObject({ action: 'operator.kyb_rejected' });

    const seen = await ctx.w.call('GET', `/v1/operators/${ctx.operatorId}`, ctx.as(ctx.owner));
    expect(seen.body?.kybRejectionReason).toBe(
      'The CAC certificate is unreadable; upload a clearer scan.',
    );
    const fix = await ctx.w.call('PATCH', `/v1/operators/${ctx.operatorId}`, {
      ...ctx.as(ctx.owner),
      body: { tradingName: 'Eko Parking VI' },
    });
    expect(fix.status).toBe(200);
    const resubmit = await ctx.w.call(
      'POST',
      `/v1/operators/${ctx.operatorId}/kyb/submit`,
      ctx.as(ctx.owner),
    );
    expect(resubmit.body).toMatchObject({ kybStatus: 'SUBMITTED', kybRejectionReason: null });
  });
});

describe('who may review KYB', () => {
  it.each([
    ['ADMIN_SUPPORT', 403],
    ['ADMIN_FINANCE', 403],
    ['ADMIN_COMPLIANCE', 200],
    ['SUPER_ADMIN', 200],
  ] as const)('%s → %i', async (role, status) => {
    const ctx = await submittedOperator();
    const who = ctx.w.user([{ role, operatorId: null }], 'Staff');
    const res = await ctx.w.call('GET', `/v1/admin/operators/${ctx.operatorId}`, ctx.as(who));
    expect(res.status).toBe(status);
  });

  it('refuses operator owners, even for their own operator', async () => {
    const ctx = await submittedOperator();
    const res = await ctx.w.call('POST', `/v1/admin/operators/${ctx.operatorId}/kyb/review`, {
      ...ctx.as(ctx.owner),
      body: { decision: 'APPROVE' },
    });
    expect(res.status).toBe(403);
  });
});
