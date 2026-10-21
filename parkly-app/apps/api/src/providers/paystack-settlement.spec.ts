import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paystackSettlementProvider } from './paystack-settlement.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/paystack/${name}.json`, import.meta.url), 'utf8');

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: string) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, calls };
}

const SECRET = 'sk_test_not_a_real_key_000000';
const make = (status: number, body: string) => {
  const f = fakeFetch(status, body);
  return {
    provider: paystackSettlementProvider({ secretKey: SECRET, fetch: f.fn }),
    calls: f.calls,
  };
};

describe('Paystack settlement adapter', () => {
  it('lists active Nigerian banks with the secret key as bearer token', async () => {
    const { provider, calls } = make(200, fixture('banks'));
    expect(await provider.listBanks()).toEqual([
      { code: '044', name: 'Access Bank' },
      { code: '058', name: 'Guaranty Trust Bank' },
      { code: '057', name: 'Zenith Bank' },
    ]);
    expect(calls[0]?.url).toBe(
      'https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100',
    );
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
  });

  it('resolves an account name', async () => {
    const { provider, calls } = make(200, fixture('resolve-ok'));
    expect(await provider.resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).toEqual(
      {
        accountName: 'EKO PARKING SERVICES LTD',
      },
    );
    expect(calls[0]?.url).toBe(
      'https://api.paystack.co/bank/resolve?account_number=0123456789&bank_code=058',
    );
  });

  it('returns null when Paystack cannot resolve the account (422)', async () => {
    const { provider } = make(422, fixture('resolve-fail'));
    expect(
      await provider.resolveAccount({ bankCode: '058', accountNumber: '0000000000' }),
    ).toBeNull();
  });

  it('rejects malformed input before calling Paystack', async () => {
    const { provider, calls } = make(200, fixture('resolve-ok'));
    await expect(
      provider.resolveAccount({ bankCode: '058', accountNumber: '12345&x=1' }),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it('throws on outages so callers can answer PAYMENT_PROVIDER_UNAVAILABLE', async () => {
    const { provider } = make(503, '{"status":false,"message":"Service unavailable"}');
    await expect(
      provider.resolveAccount({ bankCode: '058', accountNumber: '0123456789' }),
    ).rejects.toThrow('paystack GET /bank/resolve failed: HTTP 503');
  });

  it('creates a subaccount with the platform percentage', async () => {
    const { provider, calls } = make(200, fixture('subaccount-created'));
    expect(
      await provider.createSubaccount({
        businessName: 'Eko Parking Services Ltd',
        bankCode: '058',
        accountNumber: '0123456789',
        percentageCharge: 12,
        contactEmail: 'ops@eko.example',
      }),
    ).toEqual({ subaccountCode: 'ACCT_4hl4xenwpjy5wb' });
    expect(calls[0]?.url).toBe('https://api.paystack.co/subaccount');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      business_name: 'Eko Parking Services Ltd',
      settlement_bank: '058',
      account_number: '0123456789',
      percentage_charge: 12,
      primary_contact_email: 'ops@eko.example',
    });
  });

  it('never puts the account number or secret key in error messages', async () => {
    const { provider } = make(400, '{"status":false,"message":"Account 0123456789 invalid"}');
    const err = await provider
      .createSubaccount({
        businessName: 'X',
        bankCode: '058',
        accountNumber: '0123456789',
        percentageCharge: 12,
        contactEmail: null,
      })
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    expect(err?.message).toBe('paystack POST /subaccount failed: HTTP 400');
    expect(err?.message).not.toContain('0123456789');
    expect(err?.message).not.toContain(SECRET);
  });
});
