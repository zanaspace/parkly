import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider } from './index.js';
import { paystackHttp, type PaystackOptions } from './paystack-http.js';

/** Our references are UUIDs; anything else never reaches a URL. */
const REFERENCE = /^[0-9a-f-]{36}$/;

type VerifyData = {
  status: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  fees: number | null;
  channel: string | null;
  authorization?: { last4?: string | null; brand?: string | null } | null;
};

/**
 * Paystack checkout, verify, refund and webhook signatures (doc 01 §5.2,
 * ADR 0004). The split sends the operator's share to their subaccount;
 * Parkly keeps `transaction_charge` and bears Paystack's fee
 * (`fees.fee_bearer = PLATFORM`).
 */
export function paystackPaymentProvider(options: PaystackOptions): PaymentProvider {
  const call = paystackHttp(options);

  const checkReference = (reference: string) => {
    if (!REFERENCE.test(reference)) throw new Error('paystack: invalid reference');
  };

  return {
    name: 'paystack',

    async initialize(input) {
      const { data } = await call<{ authorization_url: string; access_code: string }>(
        'POST',
        '/transaction/initialize',
        {
          body: {
            email: input.email,
            amount: input.amountKobo,
            currency: 'NGN',
            reference: input.reference,
            ...(input.subaccountCode
              ? {
                  subaccount: input.subaccountCode,
                  transaction_charge: input.platformShareKobo,
                  bearer: 'account',
                }
              : {}),
            ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
            channels: ['card', 'bank', 'ussd', 'bank_transfer'],
            metadata: input.metadata,
          },
        },
      );
      if (!data?.authorization_url) throw new Error('paystack initialize: no checkout url');
      return { authorizationUrl: data.authorization_url, accessCode: data.access_code };
    },

    async verify(reference) {
      checkReference(reference);
      // Paystack answers 400 (sometimes 404) for a reference it has never seen.
      const { data } = await call<VerifyData>('GET', `/transaction/verify/${reference}`, {
        allow: [400, 404],
      });
      if (!data) return null;
      return {
        status: data.status,
        amountKobo: data.amount,
        currency: data.currency,
        paidAt: data.paid_at ? new Date(data.paid_at) : null,
        feesKobo: data.fees ?? null,
        channel: data.channel ?? null,
        cardLast4: data.authorization?.last4 ?? null,
        cardBrand: data.authorization?.brand ?? null,
      };
    },

    async refund({ reference, amountKobo }) {
      checkReference(reference);
      const { data } = await call<{ id: number; status: string }>('POST', '/refund', {
        body: { transaction: reference, amount: amountKobo },
      });
      if (!data) throw new Error('paystack refund: no data');
      return {
        refundId: String(data.id),
        status: data.status === 'processed' ? 'PROCESSED' : 'PENDING',
      };
    },

    verifyWebhook(rawBody, signature) {
      if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
      const expected = createHmac('sha512', options.secretKey).update(rawBody).digest();
      return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
    },
  };
}
