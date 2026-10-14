/** No 0/O or 1/I/L, so codes survive being read aloud at a gate (doc 00 §3.4). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
// Largest multiple of 31 below 256; bytes at or above it would bias the result.
const UNBIASED_LIMIT = 256 - (256 % CODE_ALPHABET.length);

export type RandomBytes = (length: number) => Uint8Array;

// Web Crypto exists in Node 22, browsers and Expo (via expo-crypto polyfill); the
// domain package has no DOM lib, so declare only what is used.
type WebCrypto = { getRandomValues(array: Uint8Array): Uint8Array };

const secureRandomBytes: RandomBytes = (length) =>
  (globalThis as unknown as { crypto: WebCrypto }).crypto.getRandomValues(new Uint8Array(length));

export function generateBookingCode(randomBytes: RandomBytes = secureRandomBytes): string {
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return `PK-${code}`;
}

const CODE_PATTERN = new RegExp(`^PK-[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function isBookingCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}
