import type { SettlementProvider } from './index.js';
import { paystackHttp, type PaystackOptions } from './paystack-http.js';

const NUBAN = /^\d{10}$/;
const BANK_CODE = /^[0-9A-Za-z]{3,10}$/;

/**
 * Paystack banks, account resolve and subaccounts (doc 02 §2.3).
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
  };
}
