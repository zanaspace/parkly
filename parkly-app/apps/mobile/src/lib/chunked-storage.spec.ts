import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, chunkedStorage, memoryStore, safeKey } from './chunked-storage';

describe('chunkedStorage', () => {
  it('round-trips values larger than one chunk', async () => {
    const raw = memoryStore();
    const store = chunkedStorage(raw);
    const big = 'x'.repeat(CHUNK_SIZE * 2 + 5);
    await store.setItem('sb-auth-token', big);
    expect(await store.getItem('sb-auth-token')).toBe(big);
    expect(raw.data.get('sb-auth-token.n')).toBe('3');
    expect([...raw.data.values()].every((v) => v.length <= CHUNK_SIZE)).toBe(true);
  });

  it('removes old chunks when a value shrinks, and on removeItem', async () => {
    const raw = memoryStore();
    const store = chunkedStorage(raw);
    await store.setItem('k', 'x'.repeat(CHUNK_SIZE * 3));
    await store.setItem('k', 'small');
    expect(await store.getItem('k')).toBe('small');
    expect(raw.data.size).toBe(2);
    await store.removeItem('k');
    expect(raw.data.size).toBe(0);
    expect(await store.getItem('k')).toBeNull();
  });

  it('stores empty strings and treats a missing chunk as no value', async () => {
    const raw = memoryStore();
    const store = chunkedStorage(raw);
    await store.setItem('k', '');
    expect(await store.getItem('k')).toBe('');
    await store.setItem('k', 'x'.repeat(CHUNK_SIZE + 1));
    raw.data.delete('k.1');
    expect(await store.getItem('k')).toBeNull();
  });

  it('makes keys SecureStore-safe', () => {
    expect(safeKey('sb-abc-auth-token:code/verifier')).toBe('sb-abc-auth-token_code_verifier');
  });
});
