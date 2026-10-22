import * as ed from '@noble/ed25519';
import qrcode from 'qrcode-generator';

/**
 * Offline QR tickets (doc 01 §7, ADR 0007). The API signs; the attendant app
 * verifies with the lot's public key and no network; the driver app only
 * shows the token. Uses only Web Crypto and pure JS, so it runs in Node, the
 * browser and Expo alike.
 *
 *   PK1.<b64url(header)>.<b64url(claims)>.<b64url(sig)>
 *   sig = Ed25519(lot key, "<b64url(header)>.<b64url(claims)>")
 */

export type QrClaims = {
  /** Booking (or pass) id. */
  b: string;
  t: 'B' | 'P';
  /** Lot id. */
  l: string;
  /** Normalised plate the attendant compares. */
  p: string;
  /** Window start and end, epoch seconds. */
  s: number;
  e: number;
  /** Booking code, the manual fallback. */
  c: string;
  /** Issued and hard expiry, epoch seconds. */
  i: number;
  x: number;
};

export type QrCheck =
  | { ok: true; claims: QrClaims }
  | { ok: false; code: 'QR_INVALID_SIGNATURE' | 'QR_WRONG_LOT' | 'QR_OUTSIDE_WINDOW' };

const PREFIX = 'PK1';
// The domain package has no DOM lib, so declare only what is used. Created on
// first use: the driver app only draws the QR and must not need TextDecoder.
type TextCodecs = {
  TextEncoder: new () => { encode(s: string): Uint8Array };
  TextDecoder: new () => { decode(b: Uint8Array): string };
};
const codecs = globalThis as unknown as TextCodecs;
const utf8 = { encode: (s: string) => new codecs.TextEncoder().encode(s) };
const fromUtf8 = { decode: (b: Uint8Array) => new codecs.TextDecoder().decode(b) };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64url without padding; no Buffer or btoa, so it behaves the same everywhere. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) out += B64[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((text.length * 6) / 8));
  let bits = 0;
  let value = 0;
  let k = 0;
  for (const ch of text) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[k++] = (value >> bits) & 255;
    }
  }
  return bytes;
}

const encodeJson = (v: unknown) => toBase64Url(utf8.encode(JSON.stringify(v)));

function decodeJson(text: string): unknown {
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  try {
    return JSON.parse(fromUtf8.decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

function isClaims(v: unknown): v is QrClaims {
  const c = v as Partial<QrClaims> | null;
  return (
    !!c &&
    typeof c.b === 'string' &&
    (c.t === 'B' || c.t === 'P') &&
    typeof c.l === 'string' &&
    typeof c.p === 'string' &&
    typeof c.c === 'string' &&
    [c.s, c.e, c.i, c.x].every((n) => Number.isSafeInteger(n))
  );
}

export async function newLotKeyPair(): Promise<{ secretKey: Uint8Array; publicKey: Uint8Array }> {
  const secretKey = ed.utils.randomSecretKey();
  return { secretKey, publicKey: await ed.getPublicKeyAsync(secretKey) };
}

export const publicKeyFor = (secretKey: Uint8Array) => ed.getPublicKeyAsync(secretKey);

export async function signQrToken(
  claims: QrClaims,
  key: { kid: string; secretKey: Uint8Array },
): Promise<string> {
  const input = `${encodeJson({ kid: key.kid })}.${encodeJson(claims)}`;
  const sig = await ed.signAsync(utf8.encode(input), key.secretKey);
  return `${PREFIX}.${input}.${toBase64Url(sig)}`;
}

/** Reads a token without checking it (to find the kid, or show what was scanned). */
export function parseQrToken(
  token: string,
): { kid: string; claims: QrClaims; input: string; signature: Uint8Array } | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, header, body, sig] = parts as [string, string, string, string];
  const kid = (decodeJson(header) as { kid?: unknown } | null)?.kid;
  const claims = decodeJson(body);
  const signature = fromBase64Url(sig);
  if (typeof kid !== 'string' || !isClaims(claims) || !signature || signature.length !== 64)
    return null;
  return { kid, claims, input: `${header}.${body}`, signature };
}

/**
 * The attendant's offline check (doc 01 §7 steps 1–3): known, unrevoked key
 * and valid signature; this lot; now within [start − early arrival,
 * end + overstay allowance] and before the hard expiry.
 */
export async function verifyQrToken(
  token: string,
  opts: {
    publicKeys: Record<string, Uint8Array>;
    revokedKids?: readonly string[];
    lotId: string;
    now: Date;
    earlyArrivalMin: number;
    overstayAllowanceMin: number;
  },
): Promise<QrCheck> {
  const invalid = { ok: false, code: 'QR_INVALID_SIGNATURE' } as const;
  const parsed = parseQrToken(token);
  if (!parsed) return invalid;
  const key = opts.publicKeys[parsed.kid];
  if (!key || opts.revokedKids?.includes(parsed.kid)) return invalid;
  // A malformed key or signature throws; treat it like a bad signature.
  const valid = await ed
    .verifyAsync(parsed.signature, utf8.encode(parsed.input), key)
    .catch(() => false);
  if (!valid) return invalid;

  const { claims } = parsed;
  if (claims.l !== opts.lotId) return { ok: false, code: 'QR_WRONG_LOT' };
  const now = Math.floor(opts.now.getTime() / 1000);
  if (
    now < claims.s - opts.earlyArrivalMin * 60 ||
    now > claims.e + opts.overstayAllowanceMin * 60 ||
    now > claims.x
  )
    return { ok: false, code: 'QR_OUTSIDE_WINDOW' };
  return { ok: true, claims };
}

/**
 * Dark/light modules of a QR code for `text`, for any renderer. Error
 * correction L (7%): tickets are shown on clean screens, and the lower level
 * keeps the code at 69 modules so a camera reads it from a phone easily.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
