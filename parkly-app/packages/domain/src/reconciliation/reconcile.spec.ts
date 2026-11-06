import { describe, expect, it } from 'vitest';
import type { Kobo } from '../money/money.js';
import {
  reconcileTransactions,
  type InternalPaymentRecord,
  type ProviderTransactionRecord,
} from './reconcile.js';

const kobo = (n: number) => n as Kobo;

describe('reconcileTransactions', () => {
  it('returns COMPLETED with all matched when internal and provider match perfectly', () => {
    const internal: InternalPaymentRecord[] = [
      {
        id: 'p1',
        reference: 'ref_1',
        amountKobo: kobo(150000),
        currency: 'NGN',
        status: 'SUCCEEDED',
        paidAt: new Date('2026-11-05T10:00:00Z'),
      },
      {
        id: 'p2',
        reference: 'ref_2',
        amountKobo: kobo(250000),
        currency: 'NGN',
        status: 'SUCCEEDED',
        paidAt: new Date('2026-11-05T11:00:00Z'),
      },
    ];

    const provider: ProviderTransactionRecord[] = [
      {
        reference: 'ref_1',
        amountKobo: kobo(150000),
        currency: 'NGN',
        status: 'success',
        paidAt: new Date('2026-11-05T10:00:00Z'),
      },
      {
        reference: 'ref_2',
        amountKobo: kobo(250000),
        currency: 'NGN',
        status: 'success',
        paidAt: new Date('2026-11-05T11:00:00Z'),
      },
    ];

    const out = reconcileTransactions({ internal, provider });
    expect(out.summary.status).toBe('COMPLETED');
    expect(out.summary.matchedCount).toBe(2);
    expect(out.summary.mismatchedCount).toBe(0);
    expect(out.items).toHaveLength(2);
    expect(out.items[0]?.result).toBe('MATCHED');
    expect(out.items[1]?.result).toBe('MATCHED');
  });

  it('identifies MISSING_INTERNAL when provider has an unrecorded charge', () => {
    const internal: InternalPaymentRecord[] = [];
    const provider: ProviderTransactionRecord[] = [
      {
        reference: 'ghost_ref',
        amountKobo: kobo(50000),
        currency: 'NGN',
        status: 'success',
        paidAt: new Date('2026-11-05T12:00:00Z'),
      },
    ];

    const out = reconcileTransactions({ internal, provider });
    expect(out.summary.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(out.summary.missingInternalCount).toBe(1);
    expect(out.summary.mismatchedCount).toBe(1);
    expect(out.items[0]?.result).toBe('MISSING_INTERNAL');
    expect(out.items[0]?.providerReference).toBe('ghost_ref');
  });

  it('identifies MISSING_PROVIDER when internal SUCCEEDED payment is absent from provider', () => {
    const internal: InternalPaymentRecord[] = [
      {
        id: 'p_missing',
        reference: 'internal_only_ref',
        amountKobo: kobo(100000),
        currency: 'NGN',
        status: 'SUCCEEDED',
        paidAt: new Date('2026-11-05T12:00:00Z'),
      },
    ];
    const provider: ProviderTransactionRecord[] = [];

    const out = reconcileTransactions({ internal, provider });
    expect(out.summary.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(out.summary.missingProviderCount).toBe(1);
    expect(out.summary.mismatchedCount).toBe(1);
    expect(out.items[0]?.result).toBe('MISSING_PROVIDER');
  });

  it('ignores uncompleted/abandoned internal checkouts that never hit the provider', () => {
    const internal: InternalPaymentRecord[] = [
      {
        id: 'p_abandoned',
        reference: 'abandoned_ref',
        amountKobo: kobo(100000),
        currency: 'NGN',
        status: 'ABANDONED',
        paidAt: null,
      },
      {
        id: 'p_init',
        reference: 'initiated_ref',
        amountKobo: kobo(100000),
        currency: 'NGN',
        status: 'INITIATED',
        paidAt: null,
      },
    ];
    const provider: ProviderTransactionRecord[] = [];

    const out = reconcileTransactions({ internal, provider });
    expect(out.summary.status).toBe('COMPLETED');
    expect(out.summary.mismatchedCount).toBe(0);
    expect(out.summary.missingProviderCount).toBe(0);
  });

  it('flags AMOUNT_MISMATCH when amounts differ', () => {
    const internal: InternalPaymentRecord[] = [
      {
        id: 'p1',
        reference: 'ref_amount',
        amountKobo: kobo(200000),
        currency: 'NGN',
        status: 'SUCCEEDED',
        paidAt: new Date(),
      },
    ];
    const provider: ProviderTransactionRecord[] = [
      {
        reference: 'ref_amount',
        amountKobo: kobo(150000),
        currency: 'NGN',
        status: 'success',
        paidAt: new Date(),
      },
    ];

    const out = reconcileTransactions({ internal, provider });
    expect(out.summary.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(out.summary.amountMismatchCount).toBe(1);
    expect(out.items[0]?.result).toBe('AMOUNT_MISMATCH');
  });

  it('flags STATUS_MISMATCH when provider succeeded but internal did not', () => {
    const internal: InternalPaymentRecord[] = [
      {
        id: 'p1',
        reference: 'ref_status',
        amountKobo: kobo(200000),
        currency: 'NGN',
        status: 'FAILED',
        paidAt: null,
      },
    ];
    const provider: ProviderTransactionRecord[] = [
      {
        reference: 'ref_status',
        amountKobo: kobo(200000),
        currency: 'NGN',
        status: 'success',
        paidAt: new Date(),
      },
    ];

    const out = reconcileTransactions({ internal, provider });
    expect(out.summary.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(out.summary.statusMismatchCount).toBe(1);
    expect(out.items[0]?.result).toBe('STATUS_MISMATCH');
  });

  it('treats both failed as MATCHED', () => {
    const internal: InternalPaymentRecord[] = [
      {
        id: 'p1',
        reference: 'ref_both_failed',
        amountKobo: kobo(200000),
        currency: 'NGN',
        status: 'FAILED',
        paidAt: null,
      },
    ];
    const provider: ProviderTransactionRecord[] = [
      {
        reference: 'ref_both_failed',
        amountKobo: kobo(200000),
        currency: 'NGN',
        status: 'failed',
        paidAt: null,
      },
    ];

    const out = reconcileTransactions({ internal, provider });
    expect(out.summary.status).toBe('COMPLETED');
    expect(out.summary.matchedCount).toBe(1);
    expect(out.items[0]?.result).toBe('MATCHED');
  });
});
