import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { paystackPaymentProvider } from './paystack-payments.js';

type Call = { url: string; init: RequestInit };

const SECRET = 'sk_test_not_a_real_key_000000';
const REF = '0199f0a0-0000-7000-8000-000000000001';

function make(status: number, body: unknown) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { provider: paystackPaymentProvider({ secretKey: SECRET, fetch: fn }), calls };
}

const bodyOf = (c: Call | undefined) => JSON.parse(String(c?.init.body)) as Record<string, unknown>;

describe('Paystack payments adapter (doc 01 §5.2)', () => {
  const init = {
    reference: REF,
    amountKobo: 210_000,
    email: 'driver@example.com',
    subaccountCode: 'ACCT_abc123',
    platformShareKobo: 34_000,
    callbackUrl: 'https://parkly.example/bookings/paid',
    metadata: { bookingCode: 'PK-7HQ4MZ' },
  };

  it('initializes with the split: subaccount, flat charge, Parkly bears the fee', async () => {
    const { provider, calls } = make(200, {
      status: true,
      data: { authorization_url: 'https://checkout.paystack.com/x1', access_code: 'x1' },
    });
    expect(await provider.initialize(init)).toEqual({
      authorizationUrl: 'https://checkout.paystack.com/x1',
      accessCode: 'x1',
    });
    expect(calls[0]?.url).toBe('https://api.paystack.co/transaction/initialize');
    expect(calls[0]?.init.method).toBe('POST');
    expect(bodyOf(calls[0])).toEqual({
      email: 'driver@example.com',
      amount: 210_000,
      currency: 'NGN',
      reference: REF,
      subaccount: 'ACCT_abc123',
      transaction_charge: 34_000,
      bearer: 'account',
      callback_url: 'https://parkly.example/bookings/paid',
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
      metadata: { bookingCode: 'PK-7HQ4MZ' },
    });
  });

  it('leaves out the split when there is no subaccount (non-prod demo lots)', async () => {
    const { provider, calls } = make(200, {
      status: true,
      data: { authorization_url: 'https://checkout.paystack.com/x2', access_code: 'x2' },
    });
    await provider.initialize({ ...init, subaccountCode: null, callbackUrl: null });
    const body = bodyOf(calls[0]);
    expect(body).not.toHaveProperty('subaccount');
    expect(body).not.toHaveProperty('transaction_charge');
    expect(body).not.toHaveProperty('callback_url');
  });

  it('fails without leaking the body when Paystack refuses', async () => {
    const { provider } = make(400, { status: false, message: 'Invalid key sk_test_x' });
    await expect(provider.initialize(init)).rejects.toThrow(
      'paystack POST /transaction/initialize failed: HTTP 400',
    );
  });

  it('verifies a charge and keeps only last4 and brand from the card', async () => {
    const { provider, calls } = make(200, {
      status: true,
      data: {
        status: 'success',
        amount: 210_000,
        currency: 'NGN',
        paid_at: '2026-10-22T13:21:05.000Z',
        fees: 3_150,
        channel: 'card',
        authorization: {
          authorization_code: 'AUTH_secret',
          bin: '408408',
          last4: '4081',
          brand: 'visa',
        },
      },
    });
    expect(await provider.verify(REF)).toEqual({
      status: 'success',
      amountKobo: 210_000,
      currency: 'NGN',
      paidAt: new Date('2026-10-22T13:21:05.000Z'),
      feesKobo: 3_150,
      channel: 'card',
      cardLast4: '4081',
      cardBrand: 'visa',
    });
    expect(calls[0]?.url).toBe(`https://api.paystack.co/transaction/verify/${REF}`);
  });

  it('returns null for an unknown reference', async () => {
    const { provider } = make(400, { status: false, message: 'Transaction reference not found' });
    expect(await provider.verify(REF)).toBeNull();
  });

  it('refuses to put an odd reference in the URL', async () => {
    const { provider, calls } = make(200, { status: true, data: {} });
    await expect(provider.verify('../bank')).rejects.toThrow(/reference/);
    expect(calls).toHaveLength(0);
  });

  it('asks for a refund by reference', async () => {
    const { provider, calls } = make(200, { status: true, data: { id: 9001, status: 'pending' } });
    expect(await provider.refund({ reference: REF, amountKobo: 210_000 })).toEqual({
      refundId: '9001',
      status: 'PENDING',
    });
    expect(bodyOf(calls[0])).toEqual({ transaction: REF, amount: 210_000 });
  });

  it('accepts only webhooks signed with HMAC-SHA512 of the raw body', () => {
    const { provider } = make(200, {});
    const raw = '{"event":"charge.success","data":{"reference":"x"}}';
    const good = createHmac('sha512', SECRET).update(raw).digest('hex');
    expect(provider.verifyWebhook(raw, good)).toBe(true);
    expect(provider.verifyWebhook(`${raw} `, good)).toBe(false);
    expect(provider.verifyWebhook(raw, good.slice(0, -2))).toBe(false);
    expect(provider.verifyWebhook(raw, undefined)).toBe(false);
    expect(provider.verifyWebhook(raw, 'zz')).toBe(false);
  });
});
