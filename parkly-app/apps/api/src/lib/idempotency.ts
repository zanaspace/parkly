import { createHash } from 'node:crypto';
import type { Store } from '../store/types.js';
import { ApiError } from './errors.js';

const KEY = /^[A-Za-z0-9_.:-]{8,100}$/;
const KEEP_MS = 48 * 60 * 60 * 1000; // doc 02 §2.9

/**
 * Runs a mutating request once per (actor, Idempotency-Key) (doc 00 §3.10).
 * A repeat with the same body gets the stored response; the same key with a
 * different body is IDEMPOTENCY_KEY_REUSED; a repeat while the first is still
 * running is IDEMPOTENCY_IN_PROGRESS. A failed run frees the key for a retry.
 */
export async function idempotent<T>(
  store: Store,
  request: {
    actorId: string;
    key: string | undefined;
    method: string;
    path: string;
    body: unknown;
    now: Date;
  },
  run: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  const { actorId, key } = request;
  if (!key) throw new ApiError('IDEMPOTENCY_KEY_MISSING');
  if (!KEY.test(key))
    throw new ApiError(
      'VALIDATION_FAILED',
      'Idempotency-Key must be 8–100 letters, digits or -_.:',
    );

  const requestHash = createHash('sha256').update(JSON.stringify(request.body)).digest('hex');
  const claim = await store.idempotency.begin({
    actorId,
    key,
    method: request.method,
    path: request.path,
    requestHash,
    expiresAt: new Date(request.now.getTime() + KEEP_MS),
  });
  if (claim.state === 'mismatch') throw new ApiError('IDEMPOTENCY_KEY_REUSED');
  if (claim.state === 'in_progress')
    throw new ApiError('IDEMPOTENCY_IN_PROGRESS', undefined, { headers: { 'retry-after': '2' } });
  if (claim.state === 'replay')
    return { status: claim.status, body: claim.body as T, replayed: true };

  try {
    const result = await run();
    await store.idempotency.complete(actorId, key, result.status, result.body);
    return { ...result, replayed: false };
  } catch (err) {
    await store.idempotency.release(actorId, key);
    throw err;
  }
}
