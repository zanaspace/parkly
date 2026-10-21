import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pdf = (label: string) => new Uint8Array(Buffer.from(`%PDF-1.7\n${label}\n%%EOF`));

async function onboarded() {
  const w = world();
  const owner = w.user([], 'Ada');
  const res = await w.call('POST', '/v1/operators', {
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
  const operatorId = res.body?.id as string;
  const manager = w.user([{ role: 'OPERATOR_MANAGER', operatorId }], 'Bola');
  const as = (who: string) => ({ as: who, aal: 'aal2' as const });
  return { w, owner, manager, operatorId, as };
}

/** Presign → the browser uploads to Storage → complete. */
async function uploadDoc(
  ctx: Awaited<ReturnType<typeof onboarded>>,
  type: string,
  bytes = pdf(type),
) {
  const { w, owner, operatorId, as } = ctx;
  const presign = await w.call('POST', `/v1/operators/${operatorId}/kyb-documents`, {
    ...as(owner),
    body: { type, contentType: 'application/pdf', sizeBytes: bytes.length, sha256: sha(bytes) },
  });
  const fileId = presign.body?.fileId as string;
  const file = await w.store.files.find(fileId);
  if (file) w.storage.put(file.bucket, file.path, bytes);
  return w.call('POST', `/v1/operators/${operatorId}/kyb-documents/${fileId}/complete`, {
    ...as(owner),
    body: { type },
  });
}

describe('KYB documents (doc 03 O-04)', () => {
  it('uploads through a signed URL into the private kyb-docs bucket, then lists it', async () => {
    const ctx = await onboarded();
    const presign = await ctx.w.call('POST', `/v1/operators/${ctx.operatorId}/kyb-documents`, {
      ...ctx.as(ctx.owner),
      body: {
        type: 'CAC_CERT',
        contentType: 'application/pdf',
        sizeBytes: 100,
        sha256: 'a'.repeat(64),
      },
    });
    expect(presign.status).toBe(201);
    expect(presign.body?.uploadUrl).toMatch(/kyb-docs\/operator\//);

    const done = await uploadDoc(ctx, 'CAC_CERT');
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({
      type: 'CAC_CERT',
      status: 'SUBMITTED',
      mime: 'application/pdf',
    });

    const list = await ctx.w.call(
      'GET',
      `/v1/operators/${ctx.operatorId}/kyb-documents`,
      ctx.as(ctx.manager),
    );
    expect((list.body?.items as { type: string }[]).map((d) => d.type)).toEqual(['CAC_CERT']);
  });

  it('scans PDFs: malware is rejected and nothing is recorded', async () => {
    const ctx = await onboarded();
    const eicar = new Uint8Array(
      Buffer.from('%PDF-1.7 X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
    );
    const res = await uploadDoc(ctx, 'CAC_CERT', eicar);
    expect([res.status, res.body?.code, res.body?.detail]).toEqual([
      422,
      'UPLOAD_REJECTED',
      'MALWARE',
    ]);
    expect(ctx.w.store.kybDocRows).toEqual([]);
  });

  it('refuses a file that was never uploaded, without consuming it', async () => {
    const ctx = await onboarded();
    const bytes = pdf('x');
    const presign = await ctx.w.call('POST', `/v1/operators/${ctx.operatorId}/kyb-documents`, {
      ...ctx.as(ctx.owner),
      body: {
        type: 'CAC_CERT',
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: sha(bytes),
      },
    });
    const res = await ctx.w.call(
      'POST',
      `/v1/operators/${ctx.operatorId}/kyb-documents/${presign.body?.fileId as string}/complete`,
      { ...ctx.as(ctx.owner), body: { type: 'CAC_CERT' } },
    );
    expect([res.status, res.body?.code]).toEqual([409, 'UPLOAD_NOT_RECEIVED']);
  });

  it('cannot complete another operator’s file', async () => {
    const a = await onboarded();
    const b = await onboarded();
    const bytes = pdf('b');
    const presign = await b.w.call('POST', `/v1/operators/${b.operatorId}/kyb-documents`, {
      ...b.as(b.owner),
      body: {
        type: 'CAC_CERT',
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: sha(bytes),
      },
    });
    // a's owner tries b's file id under a's own operator.
    const res = await a.w.call(
      'POST',
      `/v1/operators/${a.operatorId}/kyb-documents/${presign.body?.fileId as string}/complete`,
      { ...a.as(a.owner), body: { type: 'CAC_CERT' } },
    );
    expect(res.status).toBe(404);
  });

  it('lets only the owner upload or delete; managers get 403, other operators 404', async () => {
    const ctx = await onboarded();
    const body = {
      type: 'CAC_CERT',
      contentType: 'application/pdf',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
    };
    const asManager = await ctx.w.call('POST', `/v1/operators/${ctx.operatorId}/kyb-documents`, {
      ...ctx.as(ctx.manager),
      body,
    });
    expect(asManager.status).toBe(403);
    const otherOperator = await ctx.w.call('POST', `/v1/operators/${randomUUID()}/kyb-documents`, {
      ...ctx.as(ctx.owner),
      body,
    });
    expect(otherOperator.status).toBe(404);
  });

  it('deletes a document and its stored file', async () => {
    const ctx = await onboarded();
    const doc = await uploadDoc(ctx, 'UTILITY_BILL');
    const del = await ctx.w.call(
      'DELETE',
      `/v1/operators/${ctx.operatorId}/kyb-documents/${doc.body?.id as string}`,
      ctx.as(ctx.owner),
    );
    expect(del.status).toBe(204);
    expect(ctx.w.store.kybDocRows).toEqual([]);
    expect([...ctx.w.storage.objects.keys()].filter((k) => k.startsWith('kyb-docs/'))).toEqual([]);
  });
});

describe('payout account (doc 03 O-05)', () => {
  it('lists banks', async () => {
    const ctx = await onboarded();
    const res = await ctx.w.call('GET', '/v1/banks', ctx.as(ctx.owner));
    expect(res.status).toBe(200);
    expect((res.body?.items as { code: string }[]).map((b) => b.code)).toContain('058');
  });

  it('resolves the account name and keeps only the masked number', async () => {
    const ctx = await onboarded();
    const res = await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '058', accountNumber: '0123456789' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      accountNumberLast4: '6789',
      accountName: 'EKO PARKING SERVICES LTD',
      nameMatchesLegalName: true,
      status: 'VERIFIED',
    });
    const row = ctx.w.store.payoutRows.get(ctx.operatorId);
    expect(row?.pendingAccountNumberEnc).not.toContain('0123456789');
    expect(JSON.stringify(ctx.w.store.auditRows)).not.toContain('0123456789');
  });

  it('flags a different account name for review instead of refusing it', async () => {
    const ctx = await onboarded();
    ctx.w.settlement.accounts.set('044:1111111111', 'ADA OKAFOR');
    const res = await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '044', accountNumber: '1111111111' },
    });
    expect(res.body).toMatchObject({ accountName: 'ADA OKAFOR', nameMatchesLegalName: false });
  });

  it('says so when the bank cannot resolve the account', async () => {
    const ctx = await onboarded();
    const res = await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '058', accountNumber: '9999999999' },
    });
    expect([res.status, res.body?.code]).toEqual([422, 'PAYOUT_ACCOUNT_UNRESOLVED']);
  });

  it('reports a provider outage as PAYMENT_PROVIDER_UNAVAILABLE', async () => {
    const ctx = await onboarded();
    ctx.w.settlement.failNext = true;
    const res = await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '058', accountNumber: '0123456789' },
    });
    expect([res.status, res.body?.code]).toEqual([502, 'PAYMENT_PROVIDER_UNAVAILABLE']);
  });

  it('refuses a bank that is not on the list', async () => {
    const ctx = await onboarded();
    const res = await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '999', accountNumber: '0123456789' },
    });
    expect([res.status, res.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
  });
});

describe('submit KYB (doc 03 O-06)', () => {
  it('lists what is missing', async () => {
    const ctx = await onboarded();
    await uploadDoc(ctx, 'CAC_CERT');
    const res = await ctx.w.call(
      'POST',
      `/v1/operators/${ctx.operatorId}/kyb/submit`,
      ctx.as(ctx.owner),
    );
    expect([res.status, res.body?.code]).toEqual([422, 'KYB_INCOMPLETE']);
    expect((res.body?.errors as { path: string }[]).map((e) => e.path)).toEqual([
      'DOCUMENT_DIRECTOR_ID',
      'DOCUMENT_UTILITY_BILL',
      'PAYOUT_ACCOUNT',
    ]);
  });

  it('submits when complete, audits it, and then locks details and documents', async () => {
    const ctx = await onboarded();
    for (const t of ['CAC_CERT', 'DIRECTOR_ID', 'UTILITY_BILL']) await uploadDoc(ctx, t);
    await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '058', accountNumber: '0123456789' },
    });
    const res = await ctx.w.call(
      'POST',
      `/v1/operators/${ctx.operatorId}/kyb/submit`,
      ctx.as(ctx.owner),
    );
    expect(res.status).toBe(200);
    expect(res.body?.kybStatus).toBe('SUBMITTED');
    expect(ctx.w.store.auditRows.map((a) => a.action)).toContain('operator.kyb_submitted');

    const again = await ctx.w.call(
      'POST',
      `/v1/operators/${ctx.operatorId}/kyb/submit`,
      ctx.as(ctx.owner),
    );
    expect([again.status, again.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
    const bank = await ctx.w.call('PUT', `/v1/operators/${ctx.operatorId}/payout-account`, {
      ...ctx.as(ctx.owner),
      body: { bankCode: '058', accountNumber: '0123456789' },
    });
    expect([bank.status, bank.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });
});
