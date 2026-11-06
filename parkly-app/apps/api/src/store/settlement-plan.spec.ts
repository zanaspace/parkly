import { describe, expect, it } from 'vitest';
import { planSettlement } from './settlement-plan.js';
import type { SettlementRecord, SettlementRow } from './types.js';

const OP = '0199c1d2-0000-7000-8000-000000000001';
const record = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
  provider: 'PAYSTACK',
  providerSettlementId: '3090024',
  operatorId: OP,
  subaccountCode: 'ACCT_eko0001',
  status: 'SETTLED',
  amountKobo: 176_000,
  grossKobo: 180_000,
  feesKobo: 4_000,
  settledAt: new Date('2026-11-05T00:00:00Z'),
  raw: { id: 3090024 },
  reviewReason: null,
  ...over,
});
const stored = (over: Partial<SettlementRow> = {}): SettlementRow => ({
  id: 'row-1',
  ...record(),
  ledgerJournalId: null,
  postedAt: null,
  ...over,
});

describe('planSettlement (S7 task 3)', () => {
  it('a new paid-out settlement is saved and posted', () => {
    expect(planSettlement(null, record())).toEqual({ kind: 'INSERT', post: true });
  });

  it('a new pending, failed, zero or doubtful one is saved but not posted', () => {
    expect(planSettlement(null, record({ status: 'PENDING' }))).toEqual({
      kind: 'INSERT',
      post: false,
    });
    expect(planSettlement(null, record({ status: 'FAILED' }))).toEqual({
      kind: 'INSERT',
      post: false,
    });
    expect(planSettlement(null, record({ amountKobo: 0 }))).toEqual({
      kind: 'INSERT',
      post: false,
    });
    expect(
      planSettlement(null, record({ status: 'NEEDS_REVIEW', reviewReason: 'Currency is USD' })),
    ).toEqual({ kind: 'INSERT', post: false });
  });

  it('a pending one that is now paid out is updated and posted', () => {
    expect(planSettlement(stored({ status: 'PENDING' }), record())).toEqual({
      kind: 'UPDATE',
      changes: record(),
      post: true,
    });
  });

  it('the same record seen again changes nothing', () => {
    expect(planSettlement(stored({ status: 'PENDING' }), record({ status: 'PENDING' }))).toEqual({
      kind: 'NONE',
    });
    expect(
      planSettlement(stored({ ledgerJournalId: 'j1', postedAt: new Date() }), record()),
    ).toEqual({ kind: 'NONE' });
  });

  it('a posted one is never posted again; a different story goes to review', () => {
    const posted = stored({ ledgerJournalId: 'j1', postedAt: new Date() });
    expect(planSettlement(posted, record({ amountKobo: 170_000 }))).toEqual({
      kind: 'UPDATE',
      changes: {
        status: 'NEEDS_REVIEW',
        reviewReason: 'Changed after it was posted: now SETTLED, 170000 kobo (posted 176000)',
      },
      post: false,
    });
    expect(planSettlement(posted, record({ status: 'FAILED' }))).toMatchObject({
      kind: 'UPDATE',
      post: false,
      changes: { status: 'NEEDS_REVIEW' },
    });
    // Already flagged: left alone for ops.
    expect(
      planSettlement(
        stored({ ledgerJournalId: 'j1', postedAt: new Date(), status: 'NEEDS_REVIEW' }),
        record({ amountKobo: 170_000 }),
      ),
    ).toEqual({ kind: 'NONE' });
  });
});
