import type { Manifest, ManifestBooking } from '@parkly/contracts';
import {
  findByPlate,
  gateDecision,
  type GateBooking,
  type GateDecision,
} from '@parkly/domain/checkin';
import { fromBase64Url, parseQrToken, verifyQrToken } from '@parkly/domain/qr';
import type { QueuedEvent } from './queue';

/** A gate result for the screen: the domain decision plus QR-only failures. */
export type GateResult =
  | GateDecision
  | {
      colour: 'RED';
      reason: 'INVALID' | 'WRONG_LOT';
      needsReason: false;
      bookingId: null;
      code: null;
      plate: null;
      checkedInAt: null;
    };

const red = (reason: 'INVALID' | 'WRONG_LOT'): GateResult => ({
  colour: 'RED',
  reason,
  needsReason: false,
  bookingId: null,
  code: null,
  plate: null,
  checkedInAt: null,
});

const toGate = (b: ManifestBooking): GateBooking => ({
  id: b.id,
  code: b.code,
  plateNorm: b.plateNorm,
  startAt: new Date(b.startAt),
  endAt: new Date(b.endAt),
  status: b.status,
  checkedInAt: b.checkedInAt ? new Date(b.checkedInAt) : null,
});

/** What this phone did to a booking that the server may not know yet. */
export function localStatus(
  bookingId: string,
  queue: readonly QueuedEvent[],
): { checkedInAt: Date | null; checkedOutAt: Date | null } {
  let checkedInAt: Date | null = null;
  let checkedOutAt: Date | null = null;
  for (const e of queue) {
    if (!('bookingId' in e) || e.bookingId !== bookingId) continue;
    if (e.type === 'CHECK_IN' && !checkedInAt) checkedInAt = new Date(e.deviceTime);
    if (e.type === 'CHECK_OUT') checkedOutAt = new Date(e.deviceTime);
  }
  return { checkedInAt, checkedOutAt };
}

function decide(
  booking: ManifestBooking | null,
  manifest: Manifest,
  queue: readonly QueuedEvent[],
  now: Date,
  qr?: { b: string; c: string; p: string; s: Date; e: Date },
): GateDecision {
  return gateDecision({
    booking: booking ? toGate(booking) : null,
    ...(qr ? { qr } : {}),
    localCheckedInAt: booking ? localStatus(booking.id, queue).checkedInAt : null,
    now,
    rules: manifest.rules,
  });
}

/**
 * Doc 03 §3.3 offline: verify the ticket with the lot's key (accepting any
 * time so the gate rules can judge early or late), then decide.
 */
export async function checkScan(
  text: string,
  manifest: Manifest,
  queue: readonly QueuedEvent[],
  now: Date,
): Promise<GateResult> {
  const parsed = parseQrToken(text.trim());
  if (!parsed) return red('INVALID');
  const publicKeys: Record<string, Uint8Array> = {};
  for (const k of manifest.keys) {
    const bytes = fromBase64Url(k.publicKey);
    if (bytes) publicKeys[k.kid] = bytes;
  }
  const check = await verifyQrToken(text.trim(), {
    publicKeys,
    revokedKids: manifest.revokedKids,
    lotId: manifest.lot.id,
    now,
    // Wide on purpose: gateDecision says early/late/ended; this only proves the ticket.
    earlyArrivalMin: 7 * 24 * 60,
    overstayAllowanceMin: 7 * 24 * 60,
  });
  if (!check.ok) return red(check.code === 'QR_WRONG_LOT' ? 'WRONG_LOT' : 'INVALID');
  const c = check.claims;
  const booking = manifest.bookings.find((b) => b.id === c.b) ?? null;
  return decide(booking, manifest, queue, now, {
    b: c.b,
    c: c.c,
    p: c.p,
    s: new Date(c.s * 1000),
    e: new Date(c.e * 1000),
  });
}

/** Booking code typed by the attendant (the alphabet has no 0/O or 1/I). */
export function checkCode(
  code: string,
  manifest: Manifest,
  queue: readonly QueuedEvent[],
  now: Date,
): GateDecision {
  const wanted = code.trim().toUpperCase().replace(/^PK-?/, 'PK-');
  const booking = manifest.bookings.find((b) => b.code === wanted) ?? null;
  return decide(booking, manifest, queue, now);
}

/** Plate typed by the attendant: exact matches, else one typo away; several may match. */
export function checkPlate(
  plate: string,
  manifest: Manifest,
  queue: readonly QueuedEvent[],
  now: Date,
): GateDecision[] {
  return findByPlate(manifest.bookings, plate).map((b) => decide(b, manifest, queue, now));
}

/** A-05 "Parked now": checked in (here or on the server) and not yet out. */
export function parkedNow(manifest: Manifest, queue: readonly QueuedEvent[]): ManifestBooking[] {
  return manifest.bookings.filter((b) => {
    const local = localStatus(b.id, queue);
    const inside = !!(local.checkedInAt ?? b.checkedInAt) || b.status === 'CHECKED_IN';
    const out = !!(local.checkedOutAt ?? b.checkedOutAt) || b.status === 'COMPLETED';
    return inside && !out;
  });
}
