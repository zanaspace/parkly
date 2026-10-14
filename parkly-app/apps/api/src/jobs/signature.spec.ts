import { describe, expect, it } from 'vitest';
import { signJobRequest, verifyJobSignature } from './signature.js';

const secret = 'test-job-secret-that-is-at-least-32-chars';
const now = 1_760_860_800; // unix seconds
const body = '{"limit":100}';

describe('internal job HMAC (doc 02 §6.10)', () => {
  const valid = signJobRequest({ secret, job: 'ping', timestamp: now, body });

  it('accepts a correctly signed request', () => {
    expect(
      verifyJobSignature({
        secret,
        job: 'ping',
        body,
        timestamp: String(now),
        signature: valid,
        nowSec: now,
      }),
    ).toBe(true);
  });

  it('accepts clock skew up to 300 s either way', () => {
    expect(
      verifyJobSignature({
        secret,
        job: 'ping',
        body,
        timestamp: String(now),
        signature: valid,
        nowSec: now + 300,
      }),
    ).toBe(true);
    expect(
      verifyJobSignature({
        secret,
        job: 'ping',
        body,
        timestamp: String(now),
        signature: valid,
        nowSec: now - 300,
      }),
    ).toBe(true);
  });

  it.each([
    ['wrong secret', { secret: 'x'.repeat(40) }],
    ['different job (cross-job replay)', { job: 'reconcile' }],
    ['tampered body', { body: '{"limit":101}' }],
    ['stale timestamp', { nowSec: now + 301 }],
    ['future timestamp', { nowSec: now - 301 }],
    ['non-numeric timestamp', { timestamp: 'abc' }],
    ['missing signature', { signature: undefined }],
    ['malformed signature', { signature: 'zz' }],
  ])('rejects %s', (_label, override) => {
    expect(
      verifyJobSignature({
        secret,
        job: 'ping',
        body,
        timestamp: String(now),
        signature: valid,
        nowSec: now,
        ...override,
      }),
    ).toBe(false);
  });
});
