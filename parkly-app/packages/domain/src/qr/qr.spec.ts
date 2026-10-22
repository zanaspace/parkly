import { describe, expect, it } from 'vitest';
import {
  fromBase64Url,
  newLotKeyPair,
  parseQrToken,
  publicKeyFor,
  qrMatrix,
  signQrToken,
  toBase64Url,
  verifyQrToken,
  type QrClaims,
} from './qr.js';

// A fixed key so the tests are repeatable (never a real key).
const SECRET = new Uint8Array(32).map((_, i) => i + 1);
const LOT = '01a162b3-dcae-740c-a25a-e148a6951c2e';
const START = Date.parse('2026-10-23T07:00:00Z') / 1000;
const END = Date.parse('2026-10-23T09:00:00Z') / 1000;

const claims: QrClaims = {
  b: '01a1647d-297b-7248-a1ac-7f06faee3916',
  t: 'B',
  l: LOT,
  p: 'LND123AB',
  s: START,
  e: END,
  c: 'PK-7VBZNQ',
  i: START - 3600,
  x: END + 6 * 3600,
};

const at = (iso: string) => new Date(iso);
const rules = { lotId: LOT, earlyArrivalMin: 30, overstayAllowanceMin: 240 };

async function setup() {
  const publicKey = await publicKeyFor(SECRET);
  const token = await signQrToken(claims, { kid: 'k1', secretKey: SECRET });
  return { token, keys: { k1: publicKey } };
}

describe('QR token (doc 01 §7)', () => {
  it('signs a compact PK1 token and reads its claims back', async () => {
    const { token } = await setup();
    expect(token.startsWith('PK1.')).toBe(true);
    expect(token.split('.')).toHaveLength(4);
    expect(parseQrToken(token)).toMatchObject({ kid: 'k1', claims });
  });

  it('verifies offline with the lot public key inside the window', async () => {
    const { token, keys } = await setup();
    expect(
      await verifyQrToken(token, { ...rules, publicKeys: keys, now: at('2026-10-23T06:40:00Z') }),
    ).toEqual({ ok: true, claims });
  });

  it('rejects a changed claim, an unknown key or a revoked key', async () => {
    const { token, keys } = await setup();
    const [prefix, header, , sig] = token.split('.');
    const forged = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ ...claims, e: claims.e + 86_400 })),
    );
    const now = at('2026-10-23T08:00:00Z');
    expect(
      await verifyQrToken(`${prefix}.${header}.${forged}.${sig}`, {
        ...rules,
        publicKeys: keys,
        now,
      }),
    ).toEqual({ ok: false, code: 'QR_INVALID_SIGNATURE' });
    expect(await verifyQrToken(token, { ...rules, publicKeys: {}, now })).toEqual({
      ok: false,
      code: 'QR_INVALID_SIGNATURE',
    });
    expect(
      await verifyQrToken(token, { ...rules, publicKeys: keys, now, revokedKids: ['k1'] }),
    ).toEqual({ ok: false, code: 'QR_INVALID_SIGNATURE' });
    const other = await publicKeyFor(new Uint8Array(32).fill(9));
    expect(await verifyQrToken(token, { ...rules, publicKeys: { k1: other }, now })).toEqual({
      ok: false,
      code: 'QR_INVALID_SIGNATURE',
    });
  });

  it('rejects another lot and times outside the window', async () => {
    const { token, keys } = await setup();
    const base = { ...rules, publicKeys: keys };
    expect(
      await verifyQrToken(token, { ...base, lotId: 'other', now: at('2026-10-23T08:00:00Z') }),
    ).toEqual({ ok: false, code: 'QR_WRONG_LOT' });
    expect(await verifyQrToken(token, { ...base, now: at('2026-10-23T06:29:00Z') })).toEqual({
      ok: false,
      code: 'QR_OUTSIDE_WINDOW',
    });
    expect(await verifyQrToken(token, { ...base, now: at('2026-10-23T13:01:00Z') })).toEqual({
      ok: false,
      code: 'QR_OUTSIDE_WINDOW',
    });
  });

  it('treats junk as an invalid signature, never a crash', async () => {
    const { keys } = await setup();
    for (const junk of ['', 'PK1', 'PK2.a.b.c', 'PK1.!!.??.**', 'PK1.e30.e30.AA'])
      expect(
        await verifyQrToken(junk, { ...rules, publicKeys: keys, now: at('2026-10-23T08:00:00Z') }),
      ).toEqual({ ok: false, code: 'QR_INVALID_SIGNATURE' });
    expect(parseQrToken('nope')).toBeNull();
  });

  it('makes fresh 32-byte key pairs', async () => {
    const a = await newLotKeyPair();
    const b = await newLotKeyPair();
    expect(a.secretKey).toHaveLength(32);
    expect(a.publicKey).toHaveLength(32);
    expect(toBase64Url(a.secretKey)).not.toBe(toBase64Url(b.secretKey));
  });
});

describe('base64url', () => {
  it('round-trips any bytes without padding', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 64]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 250) % 256);
      const text = toBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(fromBase64Url(text) ?? [])).toEqual(Array.from(bytes));
    }
    expect(fromBase64Url('a')).toBeNull();
    expect(fromBase64Url('ab+c')).toBeNull();
  });
});

describe('QR grid', () => {
  it('is square, the same every time, with the finder pattern in the corner', async () => {
    const { token } = await setup();
    const grid = qrMatrix(token);
    expect(grid.length).toBeGreaterThan(20);
    expect(grid.every((row) => row.length === grid.length)).toBe(true);
    expect(qrMatrix(token)).toEqual(grid);
    // Top-left finder: a dark 7×7 ring.
    expect(grid[0]?.slice(0, 7)).toEqual(Array(7).fill(true));
    expect(grid[1]?.[1]).toBe(false);
    expect(grid[3]?.[3]).toBe(true);
  });
});
