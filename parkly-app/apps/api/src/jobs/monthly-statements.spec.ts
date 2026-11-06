import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { FakeEmailProvider } from '../providers/fakes.js';
import { MemoryStore } from '../store/memory.js';
import { monthlyStatementsJob, previousLagosMonth } from './monthly-statements.js';

describe('monthly-statements job (FR-OPS-006, S7 task 5)', () => {
  it('computes the previous lagos month correctly', () => {
    expect(previousLagosMonth(new Date('2026-11-01T06:00:00Z'))).toBe('2026-10');
    expect(previousLagosMonth(new Date('2026-01-01T06:00:00Z'))).toBe('2025-12');
    expect(previousLagosMonth(new Date('2026-07-15T12:00:00Z'))).toBe('2026-06');
  });

  it('generates statement PDF and emails it to the operator owner', async () => {
    const store = new MemoryStore();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });
    const now = () => new Date('2026-11-01T06:00:00Z');

    const operatorId = randomUUID();
    store.operatorRows.set(operatorId, {
      id: operatorId,
      legalName: 'Lekki Prime Parking Ltd',
      tradingName: 'Lekki Parking',
      type: 'COMMERCIAL_LOT',
      cacNumberEnc: null,
      tinEnc: null,
      addressLine: 'Admiralty Way, Lekki',
      contactEmail: 'owner@lekki-parking.ng',
      contactPhoneEnc: null,
      status: 'ACTIVE',
      kybStatus: 'APPROVED',
      kybSubmittedAt: null,
      kybRejectionReason: null,
      commissionBps: 1200,
      createdAt: new Date('2026-01-01'),
    });

    store.payoutRows.set(operatorId, {
      operatorId,
      bankCode: '058',
      bankName: 'GTBank',
      accountNumberLast4: '4321',
      accountName: 'Lekki Prime Parking Ltd',
      pendingAccountNumberEnc: null,
      nameMismatch: false,
      providerSubaccountCode: 'ACCT_test_sub',
      status: 'ACTIVE',
      verifiedAt: new Date('2026-01-01'),
    });

    const lotId = randomUUID();
    store.lotRows.set(lotId, {
      id: lotId,
      operatorId,
      slug: 'lekki-lot-1',
      name: 'Admiralty Lot 1',
      type: 'COMMERCIAL_LOT',
      description: null,
      addressLine: '1 Admiralty Way',
      area: 'Lekki Phase 1',
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

    // Seed a successful payment in October 2026
    const bookingId = randomUUID();
    store.booking.bookingRows.push({
      id: bookingId,
      code: 'PRK-123456',
      driverId: randomUUID(),
      vehicleId: randomUUID(),
      plateNorm: 'AAA111AA',
      lotId,
      product: 'HOURLY',
      status: 'CONFIRMED',
      priceKobo: 100_000,
      serviceFeeKobo: 10_000,
      totalKobo: 110_000,
      commissionBps: 1200,
      ratePlanId: randomUUID(),
      startAt: new Date('2026-10-15T10:00:00Z'),
      endAt: new Date('2026-10-15T12:00:00Z'),
      holdExpiresAt: null,
      pricingBreakdown: {},
      source: 'MOBILE',
      createdAt: new Date('2026-10-15T09:55:00Z'),
    });

    store.booking.paymentRows.push({
      id: randomUUID(),
      kind: 'BOOKING',
      bookingId,
      payerUserId: randomUUID(),
      provider: 'PAYSTACK',
      authorizationUrl: 'https://paystack.com',
      amountKobo: 110_000,
      feesKobo: 1500,
      platformAmountKobo: 22_000,
      operatorAmountKobo: 88_000,
      operatorId,
      subaccountCode: 'ACCT_test_sub',
      status: 'SUCCEEDED',
      channel: 'card',
      cardLast4: '4081',
      cardBrand: 'visa',
      accessCode: null,
      paidAt: new Date('2026-10-15T10:00:00Z'),
      failureCode: null,
      createdAt: new Date('2026-10-15T09:55:00Z'),
    });

    // Seed a settlement in October 2026
    store.settlementStore.rows.push({
      id: randomUUID(),
      provider: 'PAYSTACK',
      providerSettlementId: 'SETTLE_OCT_001',
      operatorId,
      subaccountCode: 'ACCT_test_sub',
      status: 'SETTLED',
      amountKobo: 88_000,
      grossKobo: 88_000,
      feesKobo: 0,
      settledAt: new Date('2026-10-16T12:00:00Z'),
      raw: {},
      reviewReason: null,
      ledgerJournalId: null,
      postedAt: new Date('2026-10-16T12:00:00Z'),
    });

    const job = monthlyStatementsJob({ store, email, logger, now });
    const res = await job({ payload: {}, deadline: new Date('2026-11-01T07:00:00Z') });

    expect(res).toEqual({ processed: 1, remaining: 0 });
    expect(email.sent).toHaveLength(1);
    const sent = email.sent[0];
    expect(sent?.to).toBe('owner@lekki-parking.ng');
    expect(sent?.subject).toContain('2026-10');
    expect(sent?.attachments).toHaveLength(1);
    expect(sent?.attachments?.[0]?.filename).toContain('parkly-statement-');
    expect(sent?.attachments?.[0]?.contentType).toBe('application/pdf');
    expect(sent?.attachments?.[0]?.content).toBeInstanceOf(Uint8Array);
  });

  it('respects deadline and yields remaining count', async () => {
    const store = new MemoryStore();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });
    const now = () => new Date('2026-11-01T06:00:00Z');

    const operatorId = randomUUID();
    store.operatorRows.set(operatorId, {
      id: operatorId,
      legalName: 'Op 1',
      tradingName: 'Op 1',
      type: 'COMMERCIAL_LOT',
      cacNumberEnc: null,
      tinEnc: null,
      addressLine: null,
      contactEmail: 'op1@example.ng',
      contactPhoneEnc: null,
      status: 'ACTIVE',
      kybStatus: 'APPROVED',
      kybSubmittedAt: null,
      kybRejectionReason: null,
      commissionBps: 1200,
      createdAt: new Date('2026-01-01'),
    });
    store.payoutRows.set(operatorId, {
      operatorId,
      bankCode: '058',
      bankName: 'GTBank',
      accountNumberLast4: '1111',
      accountName: 'Op 1',
      pendingAccountNumberEnc: null,
      nameMismatch: false,
      providerSubaccountCode: 'ACCT_1',
      status: 'ACTIVE',
      verifiedAt: new Date('2026-01-01'),
    });

    const job = monthlyStatementsJob({ store, email, logger, now });
    // Expired deadline
    const res = await job({ payload: {}, deadline: new Date('2026-11-01T05:00:00Z') });
    expect(res.remaining).toBe(1);
    expect(res.processed).toBe(0);
    expect(email.sent).toHaveLength(0);
  });
});
