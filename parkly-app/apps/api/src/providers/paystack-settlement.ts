import type { SettlementProvider } from './index.js';

const NUBAN = /^\d{10}$/;
const BANK_CODE = /^[0-9A-Za-z]{3,10}$/;

/**
 * Paystack banks, account resolve and subaccounts (doc 02 §2.3). Errors carry
 * only the method, path and status: never the account number, response body
 * or key.
 */
export function paystackSettlementProvider(options: {
  secretKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): SettlementProvider {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? 'https://api.paystack.co').replace(/\/$/, '');

  async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    init: { query?: Record<string, string>; body?: unknown; allow?: number[] } = {},
  ): Promise<{ status: number; data: T | null }> {
    const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : '';
    const res = await doFetch(`${base}${path}${qs}`, {
      method,
      headers: {
        authorization: `Bearer ${options.secretKey}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
    if (init.allow?.includes(res.status)) return { status: res.status, data: null };
    const json = (await res.json().catch(() => null)) as { status?: boolean; data?: T } | null;
    if (!res.ok || !json?.status || json.data === undefined)
      throw new Error(`paystack ${method} ${path} failed: HTTP ${res.status}`);
    return { status: res.status, data: json.data };
  }

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
  };
}
