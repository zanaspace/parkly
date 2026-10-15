import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SEC = 300;

/**
 * Verifies a Standard Webhooks request (used by Supabase Auth hooks):
 * signature = base64(HMAC-SHA256(key, `${id}.${timestamp}.${body}`)), header
 * `webhook-signature: v1,<sig> [v1,<sig> …]`, secret `v1,whsec_<base64 key>`.
 */
export function verifyStandardWebhook(input: {
  secret: string;
  body: string;
  headers: { id: string | undefined; timestamp: string | undefined; signature: string | undefined };
  nowSec: number;
}): boolean {
  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(input.nowSec - Number(timestamp)) > TOLERANCE_SEC) return false;

  const match = /^v1,whsec_([A-Za-z0-9+/=]+)$/.exec(input.secret);
  if (!match?.[1]) return false;
  const key = Buffer.from(match[1], 'base64');

  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${input.body}`).digest();
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
