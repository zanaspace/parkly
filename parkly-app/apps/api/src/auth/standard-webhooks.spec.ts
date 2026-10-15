import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyStandardWebhook } from './standard-webhooks.js';

// Supabase hook secrets look like "v1,whsec_<base64 key>".
const keyBytes = Buffer.from('a-32-byte-test-key-for-the-hook!');
const secret = `v1,whsec_${keyBytes.toString('base64')}`;
const body = '{"user":{"phone":"2348031234567"},"sms":{"otp":"123456"}}';
const now = 1_760_860_800;

function sign(id: string, ts: number, payload: string, key = keyBytes) {
  return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64')}`;
}

const headers = (overrides: Record<string, string | undefined> = {}) => ({
  id: 'msg_1',
  timestamp: String(now),
  signature: sign('msg_1', now, body),
  ...overrides,
});

describe('Standard Webhooks verification (Supabase Send SMS Hook)', () => {
  it('accepts a valid signature', () => {
    expect(verifyStandardWebhook({ secret, body, headers: headers(), nowSec: now })).toBe(true);
  });

  it('accepts when any of several space-separated signatures matches (key rotation)', () => {
    const signature = `v1,${Buffer.from('nope').toString('base64')} ${sign('msg_1', now, body)}`;
    expect(
      verifyStandardWebhook({ secret, body, headers: headers({ signature }), nowSec: now }),
    ).toBe(true);
  });

  it.each([
    ['tampered body', { body: body.replace('123456', '654321') }],
    [
      'wrong key',
      {
        headers: headers({
          signature: sign('msg_1', now, body, Buffer.from('another-key-another-key-another!')),
        }),
      },
    ],
    ['stale timestamp', { nowSec: now + 301 }],
    ['missing id', { headers: headers({ id: undefined }) }],
    ['missing signature', { headers: headers({ signature: undefined }) }],
    [
      'non-v1 scheme',
      { headers: headers({ signature: sign('msg_1', now, body).replace('v1,', 'v2,') }) },
    ],
    ['bad timestamp', { headers: headers({ timestamp: 'soon' }) }],
  ])('rejects %s', (_label, override) => {
    expect(
      verifyStandardWebhook({ secret, body, headers: headers(), nowSec: now, ...override }),
    ).toBe(false);
  });

  it('rejects a secret in the wrong format', () => {
    expect(
      verifyStandardWebhook({ secret: 'plain-secret', body, headers: headers(), nowSec: now }),
    ).toBe(false);
  });
});
