import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../store/memory.js';
import { idempotent } from './idempotency.js';

const NOW = new Date('2026-10-19T08:00:00Z');
const request = (key: string | undefined, body: unknown = { a: 1 }) => ({
  actorId: 'u1',
  key,
  method: 'POST',
  path: '/v1/bookings',
  body,
  now: NOW,
});

describe('idempotent()', () => {
  it('runs once and replays the stored answer', async () => {
    const store = new MemoryStore();
    let runs = 0;
    const run = async () => ({ status: 201, body: { n: ++runs } });
    expect(await idempotent(store, request('key-00001'), run)).toEqual({
      status: 201,
      body: { n: 1 },
      replayed: false,
    });
    expect(await idempotent(store, request('key-00001'), run)).toEqual({
      status: 201,
      body: { n: 1 },
      replayed: true,
    });
    expect(runs).toBe(1);
  });

  it('says IN_PROGRESS while the first request is still running', async () => {
    const store = new MemoryStore();
    let release: () => void = () => undefined;
    const slow = idempotent(store, request('key-00002'), async () => {
      await new Promise<void>((r) => (release = r));
      return { status: 201, body: {} };
    });
    await expect(
      idempotent(store, request('key-00002'), async () => ({ status: 201, body: {} })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
    release();
    await slow;
  });

  it('frees the key when the run fails so the client can retry', async () => {
    const store = new MemoryStore();
    await expect(
      idempotent(store, request('key-00003'), () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(
      (await idempotent(store, request('key-00003'), async () => ({ status: 201, body: 1 })))
        .replayed,
    ).toBe(false);
  });

  it('needs a well-formed key and the same body', async () => {
    const store = new MemoryStore();
    const run = async () => ({ status: 201, body: {} });
    await expect(idempotent(store, request(undefined), run)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_MISSING',
    });
    await idempotent(store, request('key-00004'), run);
    await expect(idempotent(store, request('key-00004', { a: 2 }), run)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });
});
