import type { Kobo } from '../money/money.js';

export const RECONCILIATION_RESULTS = [
  'MATCHED',
  'MISSING_INTERNAL',
  'MISSING_PROVIDER',
  'AMOUNT_MISMATCH',
  'STATUS_MISMATCH',
  'AUTO_FIXED',
] as const;

export type ReconciliationResult = (typeof RECONCILIATION_RESULTS)[number];

export const RECONCILIATION_RUN_STATUSES = [
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_EXCEPTIONS',
  'FAILED',
] as const;

export type ReconciliationRunStatus = (typeof RECONCILIATION_RUN_STATUSES)[number];

export type InternalPaymentRecord = {
  id: string;
  reference: string;
  amountKobo: Kobo;
  currency: string;
  status: string;
  paidAt: Date | null;
  operatorId?: string | null;
  bookingId?: string | null;
};

export type ProviderTransactionRecord = {
  reference: string;
  amountKobo: Kobo;
  currency: string;
  status: string;
  paidAt: Date | null;
  feesKobo?: Kobo | null;
  channel?: string | null;
};

export type ReconciliationItemOutcome = {
  paymentId: string | null;
  providerReference: string;
  result: ReconciliationResult;
  details: {
    internalAmountKobo?: Kobo | null;
    providerAmountKobo?: Kobo | null;
    internalStatus?: string | null;
    providerStatus?: string | null;
    internalCurrency?: string | null;
    providerCurrency?: string | null;
    reason?: string;
  };
};

export type ReconciliationSummary = {
  totalInternal: number;
  totalProvider: number;
  matchedCount: number;
  mismatchedCount: number;
  missingInternalCount: number;
  missingProviderCount: number;
  amountMismatchCount: number;
  statusMismatchCount: number;
  autoFixedCount: number;
  status: ReconciliationRunStatus;
};

export type ReconciliationOutput = {
  summary: ReconciliationSummary;
  items: ReconciliationItemOutcome[];
};

/** Normalize provider status to standard success/failed/abandoned */
function isProviderSuccessful(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'success' || s === 'successful';
}

function isInternalSuccessful(status: string): boolean {
  return status === 'SUCCEEDED' || status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED';
}

/**
 * Compares internal payment records against external provider transactions (doc 02 §2.7).
 * Identifies matches, missing records on either side, amount mismatches, and status mismatches.
 */
export function reconcileTransactions(input: {
  internal: readonly InternalPaymentRecord[];
  provider: readonly ProviderTransactionRecord[];
}): ReconciliationOutput {
  const internalMap = new Map<string, InternalPaymentRecord>();
  for (const p of input.internal) {
    internalMap.set(p.reference, p);
  }

  const providerMap = new Map<string, ProviderTransactionRecord>();
  for (const t of input.provider) {
    providerMap.set(t.reference, t);
  }

  const items: ReconciliationItemOutcome[] = [];
  let matchedCount = 0;
  let missingInternalCount = 0;
  let missingProviderCount = 0;
  let amountMismatchCount = 0;
  let statusMismatchCount = 0;
  const autoFixedCount = 0;

  // 1. Process all provider transactions
  for (const pTx of input.provider) {
    const internal = internalMap.get(pTx.reference);

    if (!internal) {
      // Present in provider, completely absent from internal DB
      missingInternalCount++;
      items.push({
        paymentId: null,
        providerReference: pTx.reference,
        result: 'MISSING_INTERNAL',
        details: {
          providerAmountKobo: pTx.amountKobo,
          providerStatus: pTx.status,
          providerCurrency: pTx.currency,
          reason: 'Transaction exists in provider records but not in internal payments',
        },
      });
      continue;
    }

    const providerSuccess = isProviderSuccessful(pTx.status);
    const internalSuccess = isInternalSuccessful(internal.status);

    if (providerSuccess && internalSuccess) {
      if (internal.amountKobo === pTx.amountKobo && internal.currency === pTx.currency) {
        matchedCount++;
        items.push({
          paymentId: internal.id,
          providerReference: pTx.reference,
          result: 'MATCHED',
          details: {
            internalAmountKobo: internal.amountKobo,
            providerAmountKobo: pTx.amountKobo,
            internalStatus: internal.status,
            providerStatus: pTx.status,
          },
        });
      } else {
        amountMismatchCount++;
        items.push({
          paymentId: internal.id,
          providerReference: pTx.reference,
          result: 'AMOUNT_MISMATCH',
          details: {
            internalAmountKobo: internal.amountKobo,
            providerAmountKobo: pTx.amountKobo,
            internalCurrency: internal.currency,
            providerCurrency: pTx.currency,
            reason: `Amount mismatch: internal ${internal.amountKobo} vs provider ${pTx.amountKobo}`,
          },
        });
      }
    } else if (providerSuccess && !internalSuccess) {
      // Provider succeeded but internal payment was never settled / stuck in INITIATED/PENDING/ABANDONED
      statusMismatchCount++;
      items.push({
        paymentId: internal.id,
        providerReference: pTx.reference,
        result: 'STATUS_MISMATCH',
        details: {
          internalAmountKobo: internal.amountKobo,
          providerAmountKobo: pTx.amountKobo,
          internalStatus: internal.status,
          providerStatus: pTx.status,
          reason: `Provider charge succeeded but internal payment is ${internal.status}`,
        },
      });
    } else if (!providerSuccess && internalSuccess) {
      // Provider failed or reversed, but internal thinks it's SUCCEEDED
      statusMismatchCount++;
      items.push({
        paymentId: internal.id,
        providerReference: pTx.reference,
        result: 'STATUS_MISMATCH',
        details: {
          internalAmountKobo: internal.amountKobo,
          providerAmountKobo: pTx.amountKobo,
          internalStatus: internal.status,
          providerStatus: pTx.status,
          reason: `Provider charge is ${pTx.status} but internal payment is ${internal.status}`,
        },
      });
    } else {
      // Both non-success (e.g. failed or abandoned on both sides)
      matchedCount++;
      items.push({
        paymentId: internal.id,
        providerReference: pTx.reference,
        result: 'MATCHED',
        details: {
          internalAmountKobo: internal.amountKobo,
          providerAmountKobo: pTx.amountKobo,
          internalStatus: internal.status,
          providerStatus: pTx.status,
        },
      });
    }
  }

  // 2. Check for internal payments that should exist on the provider but are missing
  for (const internal of input.internal) {
    if (!providerMap.has(internal.reference)) {
      // Only flag successful/settled internal payments as MISSING_PROVIDER.
      // Unpaid holds / abandoned checkouts that never hit Paystack are normal drop-offs.
      if (isInternalSuccessful(internal.status)) {
        missingProviderCount++;
        items.push({
          paymentId: internal.id,
          providerReference: internal.reference,
          result: 'MISSING_PROVIDER',
          details: {
            internalAmountKobo: internal.amountKobo,
            internalStatus: internal.status,
            internalCurrency: internal.currency,
            reason: `Internal payment is ${internal.status} but no transaction exists with provider`,
          },
        });
      }
    }
  }

  const mismatchedCount =
    missingInternalCount + missingProviderCount + amountMismatchCount + statusMismatchCount;

  const status: ReconciliationRunStatus =
    mismatchedCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_EXCEPTIONS';

  return {
    summary: {
      totalInternal: input.internal.length,
      totalProvider: input.provider.length,
      matchedCount,
      mismatchedCount,
      missingInternalCount,
      missingProviderCount,
      amountMismatchCount,
      statusMismatchCount,
      autoFixedCount,
      status,
    },
    items,
  };
}
