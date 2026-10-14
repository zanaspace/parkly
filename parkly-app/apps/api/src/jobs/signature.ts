import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SKEW_SEC = 300;

/** hex HMAC-SHA256 over `job.timestamp.body` (doc 02 §6.10). Used by tests and pg_net SQL. */
export function signJobRequest(input: {
  secret: string;
  job: string;
  timestamp: number;
  body: string;
}): string {
  return createHmac('sha256', input.secret)
    .update(`${input.job}.${input.timestamp}.${input.body}`)
    .digest('hex');
}

export function verifyJobSignature(input: {
  secret: string;
  job: string;
  body: string;
  timestamp: string | undefined;
  signature: string | undefined;
  nowSec: number;
}): boolean {
  const { timestamp, signature } = input;
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const ts = Number(timestamp);
  if (Math.abs(input.nowSec - ts) > MAX_SKEW_SEC) return false;
  const expected = signJobRequest({
    secret: input.secret,
    job: input.job,
    timestamp: ts,
    body: input.body,
  });
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
