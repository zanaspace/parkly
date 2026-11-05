import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signedHook, world } from '../../test-helpers.js';

const HOOK = '/hooks/supabase/send-email';
const SUPABASE = 'https://test.supabase.co';
const ADA = randomUUID();

function payload(
  type: string,
  over: { user?: Record<string, unknown>; data?: Record<string, unknown> } = {},
) {
  return JSON.stringify({
    user: { id: ADA, email: 'ada@example.com', user_metadata: {}, ...over.user },
    email_data: {
      token: '123456',
      token_hash: 'hash_for_new_or_only_address',
      token_new: '',
      token_hash_new: '',
      redirect_to: 'https://portal.parkly.test/auth/confirm?next=/update-password',
      site_url: 'https://portal.parkly.test',
      email_action_type: type,
      ...over.data,
    },
  });
}

const send = (w: ReturnType<typeof world>, body: string) => w.app.request(HOOK, signedHook(body));

describe('Send Email Hook (ADR 0022)', () => {
  it('sends the sign-in code through our provider, in the Parkly layout', async () => {
    const w = world();
    const res = await send(w, payload('magiclink'));
    expect(res.status).toBe(200);
    expect(w.email.sent).toHaveLength(1);
    const [m] = w.email.sent;
    expect(m?.to).toBe('ada@example.com');
    expect(m?.subject).toBe('Your Parkly sign-in code');
    expect(m?.html).toContain('123456');
    expect(m?.html).toContain('Parkly');
    expect(m?.html).toContain('#137066');
    expect(m?.text).toContain('123456');
  });

  it('a first-time code sign-in (signup) gets the code, an operator signup gets a confirm link', async () => {
    const w = world();
    await send(w, payload('signup'));
    expect(w.email.sent[0]?.html).toContain('123456');

    await send(
      w,
      payload('signup', {
        user: { email: 'owner@example.com', user_metadata: { operator_signup: true } },
      }),
    );
    const op = w.email.sent[1];
    expect(op?.subject).toBe('Confirm your email for Parkly');
    expect(op?.html).not.toContain('123456');
    expect(op?.html).toContain(
      `${SUPABASE}/auth/v1/verify?token=hash_for_new_or_only_address&amp;type=signup`,
    );
  });

  it('password reset: a link through Supabase verify back to our /auth/confirm', async () => {
    const w = world();
    expect((await send(w, payload('recovery'))).status).toBe(200);
    const m = w.email.sent[0];
    expect(m?.subject).toBe('Reset your Parkly password');
    const url = new URL(
      `${SUPABASE}/auth/v1/verify?token=hash_for_new_or_only_address&type=recovery&redirect_to=${encodeURIComponent('https://portal.parkly.test/auth/confirm?next=/update-password')}`,
    );
    expect(m?.text).toContain(url.toString());
    expect(m?.html).not.toContain('123456');
  });

  it('secure email change: two emails, with Supabase’s reversed token names', async () => {
    const w = world();
    await send(
      w,
      payload('email_change', {
        user: { email: 'old@example.com', new_email: 'new@example.com' },
        data: { token_hash_new: 'hash_for_current', token_new: '654321' },
      }),
    );
    const byTo = Object.fromEntries(w.email.sent.map((m) => [m.to, m.text]));
    expect(byTo['old@example.com']).toContain('token=hash_for_current');
    expect(byTo['new@example.com']).toContain('token=hash_for_new_or_only_address');
  });

  it('security notices are sent and are not rate limited', async () => {
    const w = world();
    for (let i = 0; i < 5; i++)
      expect((await send(w, payload('password_changed_notification'))).status).toBe(200);
    expect(w.email.sent.at(-1)?.subject).toBe('Your Parkly password was changed');
  });

  it('refuses an unsigned or forged call without sending anything', async () => {
    const w = world();
    const forged = signedHook(payload('recovery'));
    forged.headers['webhook-signature'] = 'v1,Zm9yZ2Vk';
    expect((await w.app.request(HOOK, forged)).status).toBe(401);
    expect(w.email.sent).toHaveLength(0);
  });

  it('refuses unknown email types instead of silently sending nothing', async () => {
    const w = world();
    const res = await send(w, payload('something_new'));
    expect(res.status).toBe(400);
    expect(w.email.sent).toHaveLength(0);
  });

  it('limits codes per account: the 4th in 15 minutes is refused', async () => {
    const w = world();
    for (let i = 0; i < 3; i++) expect((await send(w, payload('magiclink'))).status).toBe(200);
    const res = await send(w, payload('recovery'));
    expect(res.status).toBe(429);
    expect(w.email.sent).toHaveLength(3);
    // Another account is unaffected.
    expect(
      (await send(w, payload('magiclink', { user: { id: randomUUID(), email: 'bo@example.com' } })))
        .status,
    ).toBe(200);
  });

  it('tells Supabase when the provider is down', async () => {
    const w = world();
    w.email.failNext = true;
    expect((await send(w, payload('magiclink'))).status).toBe(502);
  });

  it('is off (503) until the hook secret is configured', async () => {
    const w = world({ authEmail: undefined });
    expect((await send(w, payload('magiclink'))).status).toBe(503);
  });

  it('escapes addresses typed by people', async () => {
    const w = world();
    await send(
      w,
      payload('email_change', {
        user: { email: 'old@example.com', new_email: '<b>x</b>@example.com' },
        data: { token_hash_new: 'hash_for_current' },
      }),
    );
    expect(w.email.sent[0]?.html).not.toContain('<b>x</b>');
  });

  it('never logs the code, the link token or the address', async () => {
    const lines: string[] = [];
    const { createLogger } = await import('../../lib/logger.js');
    const { Writable } = await import('node:stream');
    const logger = createLogger({
      level: 'info',
      stream: new Writable({ write: (chunk, _e, cb) => (lines.push(String(chunk)), cb()) }),
    });
    const w = world({ logger });
    await send(w, payload('magiclink', { data: { token: '987654' } }));
    await send(w, payload('recovery'));
    const all = lines.join('');
    expect(all).not.toContain('987654');
    expect(all).not.toContain('hash_for_new_or_only_address');
    expect(all).not.toContain('ada@example.com');
  });
});
