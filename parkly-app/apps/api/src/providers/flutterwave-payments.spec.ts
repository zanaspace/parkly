import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { flutterwavePaymentProvider } from './flutterwave-payments.js';

describe('flutterwavePaymentProvider (FR-PAY-007 contract tests)', () => {
  it('initializes a split payment in NGN and returns checkout link', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const provider = flutterwavePaymentProvider({
      secretKey: 'FLWSECK_TEST-secret',
      webhookSecretHash: 'flw-secret-hash',
      fetchImpl: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            status: 'success',
            message: 'Hosted Link',
            data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/flw123' },
          }),
          { status: 200 },
        );
      },
    });

    const out = await provider.initialize({
      reference: '01950000-0000-7000-8000-000000000001',
      amountKobo: 250_000,
      email: 'driver@parkly.ng',
      subaccountCode: 'RS_SUB_123',
      platformShareKobo: 37_500,
      callbackUrl: 'https://parkly.ng/bookings/return',
      metadata: { bookingId: 'b-1' },
    });

    expect(out).toEqual({
      authorizationUrl: 'https://checkout.flutterwave.com/v3/hosted/pay/flw123',
      accessCode: 'flw_01950000-0000-7000-8000-000000000001',
    });
    expect(capturedBody).toMatchObject({
      tx_ref: '01950000-0000-7000-8000-000000000001',
      amount: 2500,
      currency: 'NGN',
      redirect_url: 'https://parkly.ng/bookings/return',
      subaccounts: [
        {
          id: 'RS_SUB_123',
          transaction_charge_type: 'flat_subaccount',
          transaction_charge: 2125,
        },
      ],
    });
  });

  it('verifies a successful charge and normalizes NGN to kobo', async () => {
    const provider = flutterwavePaymentProvider({
      secretKey: 'FLWSECK_TEST-secret',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: 'success',
            message: 'Transaction fetched successfully',
            data: {
              id: 987654,
              tx_ref: 'ref-1',
              amount: 2500,
              currency: 'NGN',
              status: 'successful',
              created_at: '2026-04-01T10:00:00.000Z',
              app_fee: 35,
              payment_type: 'card',
              card: { last_4digits: '4081', type: 'VISA' },
            },
          }),
          { status: 200 },
        ),
    });

    const charge = await provider.verify('ref-1');
    expect(charge).toEqual({
      status: 'success',
      amountKobo: 250_000,
      currency: 'NGN',
      paidAt: new Date('2026-04-01T10:00:00.000Z'),
      feesKobo: 3_500,
      channel: 'card',
      cardLast4: '4081',
      cardBrand: 'VISA',
    });
  });

  it('verifies webhook signatures via both verif-hash and HMAC-SHA256', () => {
    const provider = flutterwavePaymentProvider({
      secretKey: 'FLWSECK_TEST-secret',
      webhookSecretHash: 'my-verif-hash-secret',
    });

    const body = JSON.stringify({ event: 'charge.completed', data: { tx_ref: 'ref-1' } });
    expect(provider.verifyWebhook(body, 'my-verif-hash-secret')).toBe(true);

    const hmac = createHmac('sha256', 'my-verif-hash-secret').update(body, 'utf8').digest('hex');
    expect(provider.verifyWebhook(body, hmac)).toBe(true);
    expect(provider.verifyWebhook(body, 'wrong-hash')).toBe(false);
    expect(provider.verifyWebhook(body, undefined)).toBe(false);
  });

  it('processes refunds by resolving numeric transaction id first', async () => {
    const calls: string[] = [];
    const provider = flutterwavePaymentProvider({
      secretKey: 'FLWSECK_TEST-secret',
      fetchImpl: async (url) => {
        const u = String(url);
        calls.push(u);
        if (u.includes('verify_by_reference')) {
          return new Response(
            JSON.stringify({
              status: 'success',
              message: 'ok',
              data: {
                id: 445566,
                tx_ref: 'ref-1',
                amount: 2500,
                currency: 'NGN',
                status: 'successful',
              },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            status: 'success',
            message: 'Refund initiated',
            data: { id: 99001, status: 'completed' },
          }),
          { status: 200 },
        );
      },
    });

    const out = await provider.refund({ reference: 'ref-1', amountKobo: 100_000 });
    expect(out).toEqual({ refundId: '99001', status: 'PROCESSED' });
    expect(calls).toHaveLength(2);
  });
});
