import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * App-level encryption for [enc] columns and peppered lookup hashes (doc 02 §1,
 * ADR 0002). Ciphertext format: `<keyVersion>:<iv b64>:<tag b64>:<data b64>`,
 * so keys can be rotated while old rows stay readable. Server-only, so it
 * lives in the API rather than packages/domain.
 */
export type FieldCrypto = {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  /** HMAC-SHA256 with the pepper; for unique lookups (phone_hash, email_hash, ip_hash). */
  lookupHash(value: string): Buffer;
};

export function createCrypto(options: {
  encKeys: Record<string, Buffer>;
  currentEncVersion: string;
  pepper: string;
}): FieldCrypto {
  for (const [version, key] of Object.entries(options.encKeys)) {
    if (key.length !== 32) throw new Error(`encryption key ${version} must be 32 bytes`);
  }
  const current = options.encKeys[options.currentEncVersion];
  if (!current) throw new Error(`no encryption key for ${options.currentEncVersion}`);

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', current, iv);
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [options.currentEncVersion, iv, tag, data]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
        .join(':');
    },
    decrypt(ciphertext) {
      const [version, iv, tag, data] = ciphertext.split(':');
      const key = version ? options.encKeys[version] : undefined;
      if (!key || !iv || !tag || data === undefined) throw new Error('unreadable ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
    lookupHash(value) {
      return createHmac('sha256', options.pepper).update(value).digest();
    },
  };
}
