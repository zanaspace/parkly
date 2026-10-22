/**
 * The attendant's 6-digit PIN unlocks the app after 5 minutes idle (doc 05
 * §4.4). It never leaves the phone: only a PBKDF2 hash with a random salt is
 * kept, and 5 wrong tries wipe the phone's Parkly data.
 */

export const MAX_PIN_TRIES = 5;
export const IDLE_LOCK_MS = 5 * 60_000;
const ITERATIONS = 150_000;

export type StoredPin = { salt: string; hash: string };

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (text: string) =>
  new Uint8Array(text.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

export const isValidPin = (pin: string) => /^\d{6}$/.test(pin);

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    256,
  );
  return hex(bits);
}

export async function hashPin(pin: string): Promise<StoredPin> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: hex(salt), hash: await derive(pin, salt) };
}

export async function verifyPin(pin: string, stored: StoredPin): Promise<boolean> {
  const hash = await derive(pin, unhex(stored.salt));
  // Constant time over the hex strings.
  let diff = hash.length ^ stored.hash.length;
  for (let i = 0; i < Math.min(hash.length, stored.hash.length); i++)
    diff |= hash.charCodeAt(i) ^ stored.hash.charCodeAt(i);
  return diff === 0;
}
