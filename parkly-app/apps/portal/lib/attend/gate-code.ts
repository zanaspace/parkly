import { attendantGateCodeFor, gateCodePayload, gateMinute } from '@parkly/domain/checkin';

const base64UrlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const bytesToBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * The code this phone shows drivers for \`now\` (gap review G-2): signed with the
 * lot's gate key from the manifest, so it works offline and changes every
 * minute. Same HMAC-SHA256, base64url, 16 characters as the API checks.
 */
export async function attendantCode(lotId: string, gateKey: string, now: Date): Promise<string> {
  const minute = gateMinute(now);
  const key = await crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(gateKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const payload = new TextEncoder().encode(gateCodePayload({ kind: 'ATTENDANT', lotId, minute }));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  return attendantGateCodeFor(lotId, minute, bytesToBase64Url(mac).slice(0, 16));
}
