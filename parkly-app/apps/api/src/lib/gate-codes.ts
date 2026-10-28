import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  attendantCodeFresh,
  gateCodeFor,
  gateCodePayload,
  readGateCode,
  type GateCode,
} from '@parkly/domain/checkin';
import type { FieldCrypto } from './crypto.js';

const SIG_LENGTH = 16;

/** HMAC-SHA256, base64url, first 16 characters (96 bits). The attendant app signs the same way. */
export function signGatePayload(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url').slice(0, SIG_LENGTH);
}

/**
 * Signed gate codes (gap review G-1, G-2). The poster code is signed with the
 * server pepper and never sent to driver apps. Each lot has a gate key, derived
 * from the pepper and shipped only in the attendant manifest, which the phone
 * uses to show a code that changes every minute. Rotating the pepper replaces
 * every poster and key.
 */
export function gateCodes(crypto: Pick<FieldCrypto, 'lookupHash'>) {
  const posterSig = (lotId: string) =>
    crypto.lookupHash(`gate-poster:${lotId}`).toString('base64url').slice(0, SIG_LENGTH);
  const lotKey = (lotId: string) => crypto.lookupHash(`gate-attendant-key:${lotId}`);

  return {
    poster: (lotId: string) => gateCodeFor(lotId, posterSig(lotId)),
    /** The lot's gate key for the attendant manifest, base64url. */
    attendantKey: (lotId: string) => lotKey(lotId).toString('base64url'),
    /** The parsed code when its signature is right (and, on a phone, still fresh); else null. */
    verify(text: string, now: Date): GateCode | null {
      const code = readGateCode(text);
      if (!code) return null;
      if (code.kind === 'ATTENDANT' && !attendantCodeFresh(code.minute, now)) return null;
      const expected =
        code.kind === 'POSTER'
          ? posterSig(code.lotId)
          : signGatePayload(lotKey(code.lotId), gateCodePayload(code));
      const a = Buffer.from(expected);
      const b = Buffer.from(code.sig);
      return a.length === b.length && timingSafeEqual(a, b) ? code : null;
    },
  };
}
