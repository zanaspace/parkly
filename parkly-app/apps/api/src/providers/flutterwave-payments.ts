import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider, ProviderTransaction, VerifiedCharge } from './index.js';

/**
 * Flutterwave v3 adapter behind `PaymentProvider` (`FR-PAY-007`, P1).
 *
 * - Amounts are converted between Parkly integer `kobo` and Flutterwave `NGN` major units (`kobo / 100`).
 * - Split payments use Flutterwave subaccounts (`subaccounts: [{ id, transaction_charge_type: 'flat_subaccount', transaction_charge }]`).
 * - Webhooks verify the `verif-hash` (or HMAC-SHA256 signature) in constant time.
 * - Never trusts a webhook body alone: `verify(reference)` queries `/v3/transactions/verify_by_reference`.
 */

type FlwEnvelope<T> = {
  status: 'success' | 'error';
  message: string;
  data?: T;
};

type FlwInitData = {
  link: string;
};

type FlwTx = {
  id: number;
  tx_ref: string;
  flw_ref?: string;
  amount: number;
  currency: string;
  status: string;
  created_at?: string;
  app_fee?: number;
  payment_type?: string;
  card?: {
    last_4digits?: string | null;
    type?: string | null;
  } | null;
};

export function flutterwavePaymentProvider(opts: {
  secretKey: string;
  webhookSecretHash?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): PaymentProvider {
  const base = (opts.baseUrl ?? 'https://api.flutterwave.com').replace(/\/$/, '');
  const fetchFn = opts.fetchImpl ?? fetch;
  const webhookSecret = opts.webhookSecretHash ?? opts.secretKey;

  async function call<T>(path: string, init?: RequestInit): Promise<FlwEnvelope<T>> {
    let res: Response;
    try {
      res = await fetchFn(`${base}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${opts.secretKey}`,
          'content-type': 'application/json',
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new Error(`Flutterwave network error on ${path}: ${(err as Error).message}`, {
        cause: err,
      });
    }
    if (res.status === 404) {
      return { status: 'error', message: 'not found' };
    }
    const json = (await res.json().catch(() => null)) as FlwEnvelope<T> | null;
    if (!res.ok || !json) {
      throw new Error(
        `Flutterwave HTTP ${res.status} on ${path}: ${json?.message ?? 'bad response'}`,
      );
    }
    return json;
  }

  return {
    name: 'flutterwave',

    async initialize(input) {
      const amountNgn = Number((input.amountKobo / 100).toFixed(2));
      const operatorShareNgn = Number(
        (Math.max(0, input.amountKobo - input.platformShareKobo) / 100).toFixed(2),
      );

      const body: Record<string, unknown> = {
        tx_ref: input.reference,
        amount: amountNgn,
        currency: 'NGN',
        Customer: { email: input.email },
        customer: { email: input.email },
        meta: input.metadata,
      };
      if (input.callbackUrl) {
        body.redirect_url = input.callbackUrl;
      }
      if (input.subaccountCode) {
        body.subaccounts = [
          {
            id: input.subaccountCode,
            transaction_charge_type: 'flat_subaccount',
            transaction_charge: operatorShareNgn,
          },
        ];
      }

      const res = await call<FlwInitData>('/v3/payments', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.status !== 'success' || !res.data?.link) {
        throw new Error(`Flutterwave initialize rejected: ${res.message}`);
      }
      return {
        authorizationUrl: res.data.link,
        accessCode: `flw_${input.reference}`,
      };
    },

    async verify(reference): Promise<VerifiedCharge | null> {
      const res = await call<FlwTx>(
        `/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      );
      if (res.status !== 'success' || !res.data) return null;
      const d = res.data;
      const last4 = d.card?.last_4digits?.trim() ?? null;
      const rawStatus = d.status?.toLowerCase() ?? 'pending';
      const normalizedStatus = rawStatus === 'successful' ? 'success' : rawStatus;

      return {
        status: normalizedStatus,
        amountKobo: Math.round(d.amount * 100),
        currency: d.currency,
        paidAt: normalizedStatus === 'success' && d.created_at ? new Date(d.created_at) : null,
        feesKobo: typeof d.app_fee === 'number' ? Math.round(d.app_fee * 100) : null,
        channel: d.payment_type ?? null,
        cardLast4: last4 && /^\d{4}$/.test(last4) ? last4 : null,
        cardBrand: d.card?.type?.trim() || null,
      };
    },

    async refund(input) {
      // First look up the numeric Flutterwave transaction ID by reference
      const verified = await call<FlwTx>(
        `/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(input.reference)}`,
      );
      if (verified.status !== 'success' || !verified.data?.id) {
        throw new Error(`Flutterwave refund lookup failed for ${input.reference}`);
      }
      const res = await call<{ id: number; status: string }>(
        `/v3/transactions/${verified.data.id}/refund`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: Number((input.amountKobo / 100).toFixed(2)),
          }),
        },
      );
      if (res.status !== 'success' || !res.data) {
        throw new Error(`Flutterwave refund rejected: ${res.message}`);
      }
      return {
        refundId: String(res.data.id),
        status: res.data.status === 'completed' ? 'PROCESSED' : 'PENDING',
      };
    },

    verifyWebhook(rawBody, signature) {
      if (!signature) return false;
      // Support both Flutterwave's static `verif-hash` header and HMAC-SHA256 hex digest
      const sigBuf = Buffer.from(signature, 'utf8');
      const secretBuf = Buffer.from(webhookSecret, 'utf8');
      if (sigBuf.length === secretBuf.length && timingSafeEqual(sigBuf, secretBuf)) {
        return true;
      }
      const expectedHex = createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');
      if (signature.length === expectedHex.length && /^[0-9a-f]+$/i.test(signature)) {
        return timingSafeEqual(
          Buffer.from(expectedHex, 'hex'),
          Buffer.from(signature.toLowerCase(), 'hex'),
        );
      }
      return false;
    },

    async listTransactions(input): Promise<{ items: ProviderTransaction[]; total: number }> {
      const qs = new URLSearchParams({
        from: input.from.toISOString().slice(0, 10),
        to: input.to.toISOString().slice(0, 10),
        page: String(input.page ?? 1),
      });
      const res = await call<FlwTx[]>(`/v3/transactions?${qs.toString()}`);
      if (res.status !== 'success' || !Array.isArray(res.data)) {
        return { items: [], total: 0 };
      }
      const items: ProviderTransaction[] = res.data.map((d) => {
        const rawStatus = d.status?.toLowerCase() ?? 'pending';
        const status = rawStatus === 'successful' ? 'success' : rawStatus;
        return {
          reference: d.tx_ref,
          amountKobo: Math.round(d.amount * 100),
          currency: d.currency,
          status,
          paidAt: status === 'success' && d.created_at ? new Date(d.created_at) : null,
          feesKobo: typeof d.app_fee === 'number' ? Math.round(d.app_fee * 100) : null,
          channel: d.payment_type ?? null,
        };
      });
      return { items, total: items.length };
    },
  };
}
