import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

const details = {
  legalName: 'Eko Parking Services Ltd',
  tradingName: 'Eko Parking',
  type: 'COMMERCIAL_LOT',
  cacNumber: 'rc 123456',
  tin: '12345678-0001',
  addressLine: '12 Adetokunbo Ademola St, Victoria Island, Lagos',
  contactEmail: 'ops@ekoparking.ng',
  contactPhone: '0803 123 4567',
};
const create = { ...details, agreementVersion: '2026-10-01' };

/** A user who signed up by email: no role until their operator exists. */
function newcomer() {
  const w = world();
  const id = w.user([], 'Ada');
  return { w, id };
}

describe('POST /v1/operators (FR-LOT-001, doc 03 O-03)', () => {
  it('creates the operator and makes the caller its OWNER', async () => {
    const { w, id } = newcomer();
    const res = await w.call('POST', '/v1/operators', { as: id, body: create });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      legalName: 'Eko Parking Services Ltd',
      cacNumber: 'RC123456',
      tin: '12345678-0001',
      contactPhone: '+2348031234567',
      status: 'ONBOARDING',
      kybStatus: 'NOT_STARTED',
      commissionBps: 1200,
    });
    const operatorId = res.body?.id as string;
    expect(await w.store.users.roles(id)).toEqual([{ role: 'OPERATOR_OWNER', operatorId }]);
  });

  it('stores CAC, TIN and phone encrypted, never as plaintext', async () => {
    const { w, id } = newcomer();
    const res = await w.call('POST', '/v1/operators', { as: id, body: create });
    const row = w.store.operatorRows.get(res.body?.id as string);
    expect(row?.cacNumberEnc).toBeTruthy();
    for (const field of [row?.cacNumberEnc, row?.tinEnc, row?.contactPhoneEnc]) {
      expect(field).not.toMatch(/RC123456|12345678|8031234567/);
    }
  });

  it('records acceptance of the Operator Agreement and Privacy Notice, and audits the creation', async () => {
    const { w, id } = newcomer();
    const res = await w.call('POST', '/v1/operators', { as: id, body: create });
    expect(w.store.consentRows.map((c) => [c.type, c.version, c.granted])).toEqual([
      ['OPERATOR_AGREEMENT', '2026-10-01', true],
      ['PRIVACY', '2026-10-01', true],
    ]);
    expect(w.store.auditRows).toMatchObject([
      {
        actorUserId: id,
        action: 'operator.created',
        entityType: 'operator',
        entityId: res.body?.id,
      },
    ]);
  });

  it('refuses an outdated agreement version', async () => {
    const { w, id } = newcomer();
    const res = await w.call('POST', '/v1/operators', {
      as: id,
      body: { ...create, agreementVersion: '2025-01-01' },
    });
    expect([res.status, res.body?.code]).toEqual([400, 'VALIDATION_FAILED']);
    expect(w.store.operatorRows.size).toBe(0);
  });

  it('refuses a phone number that is not a Nigerian mobile', async () => {
    const { w, id } = newcomer();
    const res = await w.call('POST', '/v1/operators', {
      as: id,
      body: { ...create, contactPhone: '+44 7700 900123' },
    });
    expect([res.status, res.body?.code]).toEqual([400, 'AUTH_PHONE_INVALID']);
  });

  it('lets a user own only one operator (OPERATOR_DUPLICATE)', async () => {
    const { w, id } = newcomer();
    await w.call('POST', '/v1/operators', { as: id, body: create });
    const again = await w.call('POST', '/v1/operators', { as: id, body: create });
    expect([again.status, again.body?.code]).toEqual([409, 'OPERATOR_DUPLICATE']);
  });

  it('requires sign-in', async () => {
    const { w } = newcomer();
    expect((await w.call('POST', '/v1/operators', { body: create })).status).toBe(401);
  });
});

describe('GET / PATCH /v1/operators/{operatorId}', () => {
  async function withOperator() {
    const { w, id: owner } = newcomer();
    const res = await w.call('POST', '/v1/operators', { as: owner, body: create });
    const operatorId = res.body?.id as string;
    const manager = w.user([{ role: 'OPERATOR_MANAGER', operatorId }], 'Bola');
    return { w, owner, manager, operatorId };
  }

  it('shows the owner and managers their decrypted business details', async () => {
    const { w, owner, manager, operatorId } = await withOperator();
    for (const who of [owner, manager]) {
      const res = await w.call('GET', `/v1/operators/${operatorId}`, { as: who, aal: 'aal2' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cacNumber: 'RC123456', contactPhone: '+2348031234567' });
    }
  });

  it('needs MFA (aal2) once the user is an owner', async () => {
    const { w, owner, operatorId } = await withOperator();
    const res = await w.call('GET', `/v1/operators/${operatorId}`, { as: owner, aal: 'aal1' });
    expect([res.status, res.body?.code]).toEqual([403, 'AUTH_MFA_REQUIRED']);
  });

  it('hides another operator entirely (404, not 403)', async () => {
    const { w, owner } = await withOperator();
    const res = await w.call('GET', `/v1/operators/${randomUUID()}`, { as: owner, aal: 'aal2' });
    expect(res.status).toBe(404);
  });

  it('lets only the owner edit, and audits the change with before and after', async () => {
    const { w, owner, manager, operatorId } = await withOperator();
    const denied = await w.call('PATCH', `/v1/operators/${operatorId}`, {
      as: manager,
      aal: 'aal2',
      body: { tradingName: 'Bola Parking' },
    });
    expect(denied.status).toBe(403);

    const res = await w.call('PATCH', `/v1/operators/${operatorId}`, {
      as: owner,
      aal: 'aal2',
      body: { tradingName: 'Eko Park VI', cacNumber: 'BN-1234567' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tradingName: 'Eko Park VI', cacNumber: 'BN1234567' });
    const entry = w.store.auditRows.find((a) => a.action === 'operator.updated');
    expect(entry).toMatchObject({ entityId: operatorId });
    // Audit rows name the changed fields; encrypted values never go into the log.
    expect(entry?.after).toEqual({ fields: ['tradingName', 'cacNumber'] });
  });

  it('locks business details once KYB has been submitted', async () => {
    const { w, owner, operatorId } = await withOperator();
    const row = w.store.operatorRows.get(operatorId);
    if (row) row.kybStatus = 'SUBMITTED';
    const res = await w.call('PATCH', `/v1/operators/${operatorId}`, {
      as: owner,
      aal: 'aal2',
      body: { legalName: 'Something Else Ltd' },
    });
    expect([res.status, res.body?.code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });
});
