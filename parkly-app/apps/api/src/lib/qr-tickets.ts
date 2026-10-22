import { fromBase64Url, newLotKeyPair, signQrToken, toBase64Url } from '@parkly/domain/qr';
import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import type { BookingRow, Store } from '../store/types.js';
import type { FieldCrypto } from './crypto.js';

/** Tickets stay checkable for a day after the window, for late exits (doc 01 §7). */
const EXPIRY_AFTER_END_S = 24 * 60 * 60;
const TICKET_STATUSES = new Set(['CONFIRMED', 'CHECKED_IN']);

type LotKey = { kid: string; secretKey: Uint8Array };

/**
 * Issues offline QR tickets (doc 01 §7, ADR 0007). Each lot gets an Ed25519
 * key on its first confirmed booking; the private key is stored only as
 * FieldCrypto ciphertext and decrypted keys are kept in memory per instance.
 */
export function qrTickets(deps: { store: Store; crypto: FieldCrypto; now: () => Date }) {
  const cache = new Map<string, LotKey>();

  async function keyFor(lotId: string): Promise<LotKey> {
    const cached = cache.get(lotId);
    if (cached) return cached;
    let row = await deps.store.lotKeys.active(lotId);
    if (!row) {
      const pair = await newLotKeyPair();
      row = await deps.store.lotKeys.createActive({
        id: uuidv7(),
        lotId,
        // Short id: it is inside every QR, so every character makes the code denser.
        kid: toBase64Url(randomBytes(9)),
        publicKey: Buffer.from(pair.publicKey),
        privateKeyCiphertext: deps.crypto.encrypt(toBase64Url(pair.secretKey)),
        activatedAt: deps.now(),
      });
    }
    const secretKey = fromBase64Url(deps.crypto.decrypt(row.privateKeyCiphertext));
    if (!secretKey) throw new Error(`lot key ${row.kid} is unreadable`);
    const key = { kid: row.kid, secretKey };
    cache.set(lotId, key);
    return key;
  }

  /** The signed ticket for a paid booking; null while unpaid or after it ended. */
  return async function ticketFor(b: BookingRow): Promise<string | null> {
    if (!TICKET_STATUSES.has(b.status)) return null;
    const s = Math.floor(b.startAt.getTime() / 1000);
    const e = Math.floor(b.endAt.getTime() / 1000);
    return signQrToken(
      {
        b: b.id,
        t: 'B',
        l: b.lotId,
        p: b.plateNorm,
        s,
        e,
        c: b.code,
        i: Math.floor(deps.now().getTime() / 1000),
        x: e + EXPIRY_AFTER_END_S,
      },
      await keyFor(b.lotId),
    );
  };
}
