import { describe, expect, it } from 'vitest';
import { expoPushProvider } from './expo-push.js';
import { resendEmailProvider } from './resend.js';

type Call = { url: string; init: RequestInit };
const fakeFetch = (status: number, body: unknown) => {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
};

describe('resendEmailProvider', () => {
  it('sends from the configured address with the API key and returns the id', async () => {
    const f = fakeFetch(200, { id: 'em_123' });
    const email = resendEmailProvider({
      apiKey: 're_test_key',
      from: 'Parkly <no-reply@parkly.example>',
      fetch: f.fn,
    });
    const res = await email.send({
      to: 'ada@example.com',
      subject: 'Booking confirmed',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
    expect(res).toEqual({ providerMessageId: 'em_123' });
    expect(f.calls[0]?.url).toBe('https://api.resend.com/emails');
    expect((f.calls[0]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer re_test_key',
    );
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({
      from: 'Parkly <no-reply@parkly.example>',
      to: ['ada@example.com'],
      subject: 'Booking confirmed',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
  });

  it('throws without the address in the error when Resend refuses', async () => {
    const email = resendEmailProvider({
      apiKey: 're_test_key',
      from: 'Parkly <no-reply@parkly.example>',
      fetch: fakeFetch(403, { message: 'domain not verified' }).fn,
    });
    const err = await email
      .send({ to: 'ada@example.com', subject: 's', html: 'h', text: 't' })
      .catch((e: Error) => e);
    expect(String(err)).toContain('HTTP 403');
    expect(String(err)).not.toContain('ada@example.com');
  });
});

describe('expoPushProvider', () => {
  it('sends one message per token and reports unregistered devices', async () => {
    const f = fakeFetch(200, {
      data: [
        { status: 'ok', id: 'r1' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ],
    });
    const push = expoPushProvider({ accessToken: 'expo-access', fetch: f.fn });
    const res = await push.send({
      tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
      title: 'Booking Confirmed',
      body: 'Your space is reserved',
      data: { url: 'parkly://bookings/1' },
    });
    expect(res).toEqual({ delivered: 1, invalidTokens: ['ExponentPushToken[b]'] });
    expect(f.calls[0]?.url).toBe('https://exp.host/--/api/v2/push/send');
    expect((f.calls[0]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer expo-access',
    );
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual([
      {
        to: 'ExponentPushToken[a]',
        title: 'Booking Confirmed',
        body: 'Your space is reserved',
        data: { url: 'parkly://bookings/1' },
        sound: 'default',
      },
      {
        to: 'ExponentPushToken[b]',
        title: 'Booking Confirmed',
        body: 'Your space is reserved',
        data: { url: 'parkly://bookings/1' },
        sound: 'default',
      },
    ]);
  });

  it('works without an access token, and throws on a server error', async () => {
    const ok = fakeFetch(200, { data: [{ status: 'ok', id: 'r1' }] });
    await expoPushProvider({ fetch: ok.fn }).send({ tokens: ['t'], title: 'a', body: 'b' });
    expect((ok.calls[0]?.init.headers as Record<string, string>).authorization).toBeUndefined();

    const down = expoPushProvider({ fetch: fakeFetch(503, {}).fn });
    await expect(down.send({ tokens: ['t'], title: 'a', body: 'b' })).rejects.toThrow('HTTP 503');
  });
});
