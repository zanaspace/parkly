import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCrypto } from './crypto.js';

const keys = {
  encKeys: { v1: randomBytes(32), v2: randomBytes(32) },
  currentEncVersion: 'v2',
  pepper: 'pepper-pepper-pepper-pepper-pepper',
};

describe('field crypto (doc 02 §1 [enc] columns)', () => {
  const crypto = createCrypto(keys);

  it('round-trips and tags ciphertext with the key version', () => {
    const ct = crypto.encrypt('ExponentPushToken[abc]');
    expect(ct.startsWith('v2:')).toBe(true);
    expect(ct).not.toContain('ExponentPushToken');
    expect(crypto.decrypt(ct)).toBe('ExponentPushToken[abc]');
  });

  it('uses a fresh IV each time', () => {
    expect(crypto.encrypt('same')).not.toBe(crypto.encrypt('same'));
  });

  it('still decrypts values written with an older key', () => {
    const old = createCrypto({ ...keys, currentEncVersion: 'v1' }).encrypt('legacy');
    expect(crypto.decrypt(old)).toBe('legacy');
  });

  it('rejects tampered ciphertext and unknown key versions', () => {
    const ct = crypto.encrypt('secret');
    const parts = ct.split(':');
    const tampered = [parts[0], parts[1], parts[2], Buffer.from('xxxx').toString('base64')].join(
      ':',
    );
    expect(() => crypto.decrypt(tampered)).toThrow();
    expect(() => crypto.decrypt(ct.replace(/^v2:/, 'v9:'))).toThrow();
  });

  it('hashes deterministically with the pepper, for lookups without decrypting', () => {
    const a = crypto.lookupHash('+2348031234567');
    expect(a.equals(crypto.lookupHash('+2348031234567'))).toBe(true);
    expect(
      a.equals(
        createCrypto({ ...keys, pepper: 'another-pepper-another-pepper-xx' }).lookupHash(
          '+2348031234567',
        ),
      ),
    ).toBe(false);
    expect(a).toHaveLength(32);
  });

  it('refuses keys of the wrong size', () => {
    expect(() =>
      createCrypto({ ...keys, encKeys: { v1: randomBytes(16) }, currentEncVersion: 'v1' }),
    ).toThrow();
    expect(() => createCrypto({ ...keys, currentEncVersion: 'v7' })).toThrow();
  });
});
