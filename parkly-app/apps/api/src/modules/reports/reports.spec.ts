import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { world } from '../../test-helpers.js';

function setup() {
  const w = world();
  const operatorId = randomUUID();
  const otherOperatorId = randomUUID();

  const owner = w.user([{ role: 'OPERATOR_OWNER', operatorId }], 'Owner');
  const manager = w.user([{ role: 'OPERATOR_MANAGER', operatorId }], 'Manager');
  const otherOwner = w.user(
    [{ role: 'OPERATOR_OWNER', operatorId: otherOperatorId }],
    'Other Owner',
  );
  const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'Driver');

  const asOwner = { as: owner, aal: 'aal2' as const };
  const asManager = { as: manager, aal: 'aal2' as const };
  const asOtherOwner = { as: otherOwner, aal: 'aal2' as const };
  const asDriver = { as: driver, aal: 'aal1' as const };

  // Seed operator
  w.store.operatorRows.set(operatorId, {
    id: operatorId,
    legalName: 'Eko Parking Ltd',
    tradingName: 'Eko Parking',
    type: 'COMMERCIAL_LOT',
    cacNumberEnc: null,
    tinEnc: null,
    addressLine: '1 Victoria Island',
    contactEmail: 'owner@ekoparking.ng',
    contactPhoneEnc: null,
    status: 'ACTIVE',
    kybStatus: 'APPROVED',
    kybSubmittedAt: null,
    kybRejectionReason: null,
    commissionBps: 1200,
    createdAt: new Date('2026-01-01'),
  });

  // Seed lot
  const lotId = randomUUID();
  w.store.lotRows.set(lotId, {
    id: lotId,
    operatorId,
    slug: 'eko-lot-1',
    name: 'Eko Lot 1',
    type: 'COMMERCIAL_LOT',
    description: null,
    addressLine: '1 Victoria Island',
    area: 'Victoria Island',
    lga: 'Eti-Osa',
    location: { lat: 6.4474, lng: 3.4723 },
    entranceNotes: null,
    capacityTotal: 50,
    capacityBookable: 50,
    amenities: [],
    vehicleTypes: ['SEDAN'],
    status: 'LIVE',
    statusReason: null,
    version: 1,
    selfCheckinEnabled: false,
    createdAt: new Date('2026-01-01'),
  });

  // Seed payout account
  w.store.payoutRows.set(operatorId, {
    operatorId,
    bankCode: '058',
    bankName: 'Guaranty Trust Bank',
    accountNumberLast4: '5566',
    accountName: 'Eko Parking Ltd',
    pendingAccountNumberEnc: null,
    nameMismatch: false,
    providerSubaccountCode: 'ACCT_eko_sub',
    status: 'ACTIVE',
    verifiedAt: new Date('2026-01-01'),
  });

  return { w, operatorId, otherOperatorId, lotId, asOwner, asManager, asOtherOwner, asDriver };
}

describe('reports endpoints (FR-OPS-003, FR-OPS-006)', () => {
  it('allows owner and manager to view earnings report, and rejects unauthorized roles', async () => {
    const { w, operatorId, asOwner, asManager, asOtherOwner, asDriver } = setup();

    // Owner -> 200
    const resOwner = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/earnings?from=2026-11-01&to=2026-11-07`,
      asOwner,
    );
    expect(resOwner.status).toBe(200);
    expect(resOwner.body?.operatorId).toBe(operatorId);
    expect(resOwner.body?.daily).toHaveLength(7);

    // Manager -> 200
    const resManager = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/earnings?from=2026-11-01&to=2026-11-07`,
      asManager,
    );
    expect(resManager.status).toBe(200);

    // Other operator -> 404 (denied as NOT_FOUND to avoid leaking operator existence)
    const resOther = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/earnings?from=2026-11-01&to=2026-11-07`,
      asOtherOwner,
    );
    expect(resOther.status).toBe(404);

    // Driver -> 404
    const resDriver = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/earnings?from=2026-11-01&to=2026-11-07`,
      asDriver,
    );
    expect(resDriver.status).toBe(404);
  });

  it('validates date ranges on earnings report', async () => {
    const { w, operatorId, asOwner } = setup();

    // Bad format
    const badDate = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/earnings?from=bad-date&to=2026-11-07`,
      asOwner,
    );
    expect(badDate.status).toBe(400);

    // from > to
    const reversed = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/earnings?from=2026-11-08&to=2026-11-07`,
      asOwner,
    );
    expect(reversed.status).toBe(400);
    expect(reversed.body?.code).toBe('REPORT_RANGE_INVALID');

    // > 93 days
    const tooLong = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/earnings?from=2026-01-01&to=2026-06-01`,
      asOwner,
    );
    expect(tooLong.status).toBe(400);
    expect(tooLong.body?.code).toBe('REPORT_RANGE_INVALID');
  });

  it('exports watermarked CSV and records audit event', async () => {
    const { w, operatorId, lotId, asOwner, asOtherOwner } = setup();

    // Export CSV
    const res = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/export?from=2026-11-01&to=2026-11-03&lotId=${lotId}`,
      asOwner,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain(
      'parkly-revenue-2026-11-01-to-2026-11-03-',
    );
    expect(res.raw).toContain('Parkly revenue report');
    expect(res.raw).toContain('Car park Eko Lot 1');
    expect(res.raw).toContain('date,bookings_count,gross_booking_ngn');

    // Check audit row
    const auditRows = await w.store.audit.list({
      entityType: 'operator',
      entityId: operatorId,
      limit: 10,
    });
    expect(auditRows.some((a) => a.action === 'operator.earnings_exported')).toBe(true);

    // Other operator -> 404
    const resOther = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/export?from=2026-11-01&to=2026-11-03`,
      asOtherOwner,
    );
    expect(resOther.status).toBe(404);
  });

  it('serves monthly statement in JSON format and PDF download', async () => {
    const { w, operatorId, asOwner, asOtherOwner } = setup();

    // 1. JSON format
    const resJson = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/statements/2026-10`,
      asOwner,
    );
    expect(resJson.status).toBe(200);
    expect(resJson.body?.month).toBe('2026-10');
    expect(resJson.body?.statementNumber).toContain('STM-202610-');
    expect(resJson.body?.operatorName).toBe('Eko Parking Ltd');
    expect(resJson.body).toMatchObject({ payoutAccount: { bankName: 'Guaranty Trust Bank' } });

    // 2. PDF download
    const resPdf = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/statements/2026-10?format=pdf`,
      asOwner,
    );
    expect(resPdf.status).toBe(200);
    expect(resPdf.headers.get('content-type')).toBe('application/pdf');
    expect(resPdf.headers.get('content-disposition')).toContain('parkly-statement-STM-202610-');
    expect(resPdf.raw.startsWith('%PDF-')).toBe(true);

    // Audit row
    const auditRows = await w.store.audit.list({
      entityType: 'operator',
      entityId: operatorId,
      limit: 10,
    });
    expect(auditRows.some((a) => a.action === 'operator.statement_downloaded')).toBe(true);

    // 3. Other operator -> 404
    const resOther = await w.call(
      'GET',
      `/v1/operators/${operatorId}/reports/statements/2026-10`,
      asOtherOwner,
    );
    expect(resOther.status).toBe(404);
  });
});
