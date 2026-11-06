import type { ProviderSettlement, SettlementProvider } from './index.js';
import { paystackHttp, type PaystackOptions } from './paystack-http.js';

const NUBAN = /^\d{10}$/;
const BANK_CODE = /^[0-9A-Za-z]{3,10}$/;

/** The money fields kept from a settlement; bank details and names are left out (doc 06). */
const KEPT = [
  'id',
  'domain',
  'status',
  'currency',
  'integration',
  'total_amount',
  'effective_amount',
  'total_fees',
  'total_processed',
  'deductions',
  'settlement_date',
  'settled_by',
  'createdAt',
  'updatedAt',
] as const;

const isKobo = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const asKobo = (v: unknown) => (isKobo(v) ? v : null);

/**
 * One Paystack settlement, read strictly (S7 task 3). Only `success` in NGN
 * with a whole-kobo `effective_amount` and a date is SETTLED; anything we
 * don't recognise is NEEDS_REVIEW with the reason, and is never posted.
 * Field names follow Paystack's reference; see test/fixtures/paystack/README.md.
 * Null when the record has no id and can't be stored at all.
 */
export function toSettlement(item: unknown): ProviderSettlement | null {
  if (typeof item !== 'object' || item === null) return null;
  const r = item as Record<string, unknown>;
  if (typeof r.id !== 'number' && typeof r.id !== 'string') return null;
  const sub = r.subaccount as { subaccount_code?: unknown } | null | undefined;
  const subaccountCode = typeof sub?.subaccount_code === 'string' ? sub.subaccount_code : null;
  const settledAt =
    typeof r.settlement_date === 'string' && !Number.isNaN(Date.parse(r.settlement_date))
      ? new Date(r.settlement_date)
      : null;
  const raw: Record<string, unknown> = Object.fromEntries(
    KEPT.filter((k) => k in r).map((k) => [k, r[k]]),
  );
  if (subaccountCode) raw.subaccount_code = subaccountCode;

  const base = {
    id: String(r.id),
    amountKobo: asKobo(r.effective_amount),
    grossKobo: asKobo(r.total_amount),
    feesKobo: asKobo(r.total_fees),
    settledAt,
    subaccountCode,
    raw,
  };
  const review = (reason: string): ProviderSettlement => ({
    ...base,
    status: 'NEEDS_REVIEW',
    reviewReason: reason,
  });

  if (r.currency !== undefined && r.currency !== 'NGN')
    return review(`Currency is ${String(r.currency)}, not NGN`);
  switch (r.status) {
    case 'success':
      if (r.effective_amount === undefined) return review('No paid-out amount');
      if (!isKobo(r.effective_amount)) return review('Paid-out amount is not whole kobo');
      if (!settledAt) return review('No settlement date');
      return { ...base, status: 'SETTLED', reviewReason: null };
    case 'pending':
    case 'processing':
      return { ...base, status: 'PENDING', reviewReason: null };
    case 'failed':
      return { ...base, status: 'FAILED', reviewReason: null };
    default:
      return review(`Unknown settlement status: ${String(r.status)}`);
  }
}

/**
 * Paystack banks, account resolve, subaccounts (doc 02 §2.3) and settlements.
 */
export function paystackSettlementProvider(options: PaystackOptions): SettlementProvider {
  const call = paystackHttp(options);

  return {
    name: 'paystack',

    async listBanks() {
      const { data } = await call<{ code: string; name: string; active: boolean }[]>(
        'GET',
        '/bank',
        {
          query: { country: 'nigeria', currency: 'NGN', perPage: '100' },
        },
      );
      return (data ?? []).filter((b) => b.active).map((b) => ({ code: b.code, name: b.name }));
    },

    async resolveAccount({ bankCode, accountNumber }) {
      if (!NUBAN.test(accountNumber) || !BANK_CODE.test(bankCode)) return null;
      // Paystack answers 422 (and sometimes 400) when the account does not resolve.
      const { data } = await call<{ account_name: string }>('GET', '/bank/resolve', {
        query: { account_number: accountNumber, bank_code: bankCode },
        allow: [400, 422],
      });
      return data?.account_name ? { accountName: data.account_name } : null;
    },

    async createSubaccount(input) {
      const { data } = await call<{ subaccount_code: string }>('POST', '/subaccount', {
        body: {
          business_name: input.businessName,
          settlement_bank: input.bankCode,
          account_number: input.accountNumber,
          percentage_charge: input.percentageCharge,
          ...(input.contactEmail ? { primary_contact_email: input.contactEmail } : {}),
        },
      });
      if (!data?.subaccount_code) throw new Error('paystack POST /subaccount failed: no code');
      return { subaccountCode: data.subaccount_code };
    },

    async listSettlements({ subaccount, from, to, page, perPage }) {
      const { data, meta } = await call<unknown[]>('GET', '/settlement', {
        query: {
          subaccount: subaccount ?? 'none',
          from: from.toISOString(),
          to: to.toISOString(),
          page: String(page),
          perPage: String(perPage),
        },
      });
      const list = Array.isArray(data) ? data : [];
      const items = list.map(toSettlement).filter((s): s is ProviderSettlement => s !== null);
      return {
        items,
        pageCount: typeof meta?.pageCount === 'number' ? meta.pageCount : 0,
        unreadable: list.length - items.length,
      };
    },
  };
}
