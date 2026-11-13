import type { Manifest, ManifestBooking, ManifestPass } from '@parkly/contracts';
import {
  findByPlate,
  gateDecision,
  type GateBooking,
  type GateDecision,
} from '@parkly/domain/checkin';
import { fromBase64Url, parseQrToken, verifyQrToken } from '@parkly/domain/qr';
import type { QueuedEvent } from './queue';

export type GateResultExtras = {
  passId?: string | null;
  isPass?: boolean;
  driverVerified?: boolean;
};

/** A gate result for the screen: the domain decision plus QR-only failures and pass metadata. */
export type GateResult = (
  | GateDecision
  | {
      colour: 'RED';
      reason: 'INVALID' | 'WRONG_LOT';
      needsReason: false;
      bookingId: null;
      code: null;
      plate: null;
      checkedInAt: null;
    }
) &
  GateResultExtras;

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

/** What this phone did to a monthly pass since the last manifest download. */
export function localPassStatus(
  passId: string,
  queue: readonly QueuedEvent[],
): { lastAction: 'IN' | 'OUT' | null; checkedInAt: Date | null } {
  let lastAction: 'IN' | 'OUT' | null = null;
  let checkedInAt: Date | null = null;
  for (const e of queue) {
    if (!('passId' in e) || e.passId !== passId) continue;
    if (e.type === 'CHECK_IN') {
      lastAction = 'IN';
      checkedInAt = new Date(e.deviceTime);
    }
    if (e.type === 'CHECK_OUT') {
      lastAction = 'OUT';
    }
  }
  return { lastAction, checkedInAt };
}

function decide(
  booking: ManifestBooking | null,
  manifest: Manifest,
  queue: readonly QueuedEvent[],
  now: Date,
  qr?: { b: string; c: string; p: string; s: Date; e: Date },
): GateResult {
  const base = gateDecision({
    booking: booking ? toGate(booking) : null,
    ...(qr ? { qr } : {}),
    localCheckedInAt: booking ? localStatus(booking.id, queue).checkedInAt : null,
    now,
    rules: manifest.rules,
  });
  return {
    ...base,
    ...(booking?.driverVerified ? { driverVerified: true } : {}),
  };
}

function decidePass(
  pass: ManifestPass | null,
  queue: readonly QueuedEvent[],
  now: Date,
  qr?: { b: string; c: string; p: string; s: Date; e: Date },
): GateResult {
  if (!pass && !qr) {
    return {
      colour: 'RED',
      reason: 'NOT_FOUND',
      needsReason: false,
      bookingId: null,
      code: null,
      plate: null,
      checkedInAt: null,
    };
  }
  const passId = pass?.id ?? qr?.b ?? '';
  const code = pass?.code ?? qr?.c ?? '';
  const plate = pass?.plateNorm ?? qr?.p ?? '';
  const validFrom = pass ? new Date(`${pass.periodStart}T00:00:00.000Z`) : (qr?.s ?? now);
  const validUntil = pass ? new Date(`${pass.periodEnd}T23:59:59.999Z`) : (qr?.e ?? now);

  // If the driver swapped vehicles after this QR was saved offline, reject the old plate's QR.
  if (pass && qr && pass.plateNorm !== qr.p) {
    return red('INVALID');
  }

  if (pass && pass.status !== 'ACTIVE') {
    return {
      colour: 'RED',
      reason: 'CANCELLED',
      needsReason: false,
      bookingId: passId,
      passId,
      isPass: true,
      driverVerified: pass.driverVerified,
      code,
      plate,
      checkedInAt: null,
    };
  }

  if (now.getTime() < validFrom.getTime() || now.getTime() > validUntil.getTime()) {
    return {
      colour: 'RED',
      reason: 'ENDED',
      needsReason: false,
      bookingId: passId,
      passId,
      isPass: true,
      driverVerified: pass?.driverVerified ?? true,
      code,
      plate,
      checkedInAt: null,
    };
  }

  const local = localPassStatus(passId, queue);
  const inside =
    local.lastAction === 'IN' || (local.lastAction === null && Boolean(pass?.inLot));
  const checkedInAt =
    local.checkedInAt ?? (pass?.checkedInAt ? new Date(pass.checkedInAt) : null);

  if (inside) {
    return {
      colour: 'AMBER',
      reason: 'ALREADY_IN',
      needsReason: true,
      bookingId: passId,
      passId,
      isPass: true,
      driverVerified: pass?.driverVerified ?? true,
      code,
      plate,
      checkedInAt,
    };
  }

  if (!pass && qr) {
    return {
      colour: 'AMBER',
      reason: 'PROVISIONAL',
      needsReason: true,
      bookingId: passId,
      passId,
      isPass: true,
      driverVerified: true,
      code,
      plate,
      checkedInAt: null,
    };
  }

  return {
    colour: 'GREEN',
    reason: 'OK',
    needsReason: false,
    bookingId: passId,
    passId,
    isPass: true,
    driverVerified: pass?.driverVerified ?? true,
    code,
    plate,
    checkedInAt: null,
  };
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
    earlyArrivalMin: 40 * 24 * 60,
    overstayAllowanceMin: 40 * 24 * 60,
  });
  if (!check.ok) return red(check.code === 'QR_WRONG_LOT' ? 'WRONG_LOT' : 'INVALID');
  const c = check.claims;
  if (c.t === 'P') {
    const pass = (manifest.passes ?? []).find((p) => p.id === c.b) ?? null;
    return decidePass(pass, queue, now, {
      b: c.b,
      c: c.c,
      p: c.p,
      s: new Date(c.s * 1000),
      e: new Date(c.e * 1000),
    });
  }
  const booking = manifest.bookings.find((b) => b.id === c.b) ?? null;
  return decide(booking, manifest, queue, now, {
    b: c.b,
    c: c.c,
    p: c.p,
    s: new Date(c.s * 1000),
    e: new Date(c.e * 1000),
  });
}

/** Booking or pass code typed by the attendant (the alphabet has no 0/O or 1/I). */
export function checkCode(
  code: string,
  manifest: Manifest,
  queue: readonly QueuedEvent[],
  now: Date,
): GateResult {
  const raw = code.trim().toUpperCase();
  if (raw.startsWith('MP')) {
    const wantedPass = raw.replace(/^MP-?/, 'MP-');
    const pass = (manifest.passes ?? []).find((p) => p.code === wantedPass) ?? null;
    return decidePass(pass, queue, now);
  }
  const wanted = raw.replace(/^PK-?/, 'PK-');
  const booking = manifest.bookings.find((b) => b.code === wanted) ?? null;
  if (!booking) {
    const pass = (manifest.passes ?? []).find((p) => p.code === raw) ?? null;
    if (pass) return decidePass(pass, queue, now);
  }
  return decide(booking, manifest, queue, now);
}

/** Plate typed by the attendant: exact matches, else one typo away; several may match. */
export function checkPlate(
  plate: string,
  manifest: Manifest,
  queue: readonly QueuedEvent[],
  now: Date,
): GateResult[] {
  const bookingMatches = findByPlate(manifest.bookings, plate).map((b) =>
    decide(b, manifest, queue, now),
  );
  const passAsBookings = (manifest.passes ?? []).map((p) => ({
    ...p,
    startAt: `${p.periodStart}T00:00:00.000Z`,
    endAt: `${p.periodEnd}T23:59:59.999Z`,
    status: p.status === 'ACTIVE' ? ('CONFIRMED' as const) : ('CANCELLED' as const),
    checkedOutAt: null,
  }));
  const matchedPassIds = new Set(findByPlate(passAsBookings, plate).map((p) => p.id));
  const passMatches = (manifest.passes ?? [])
    .filter((p) => matchedPassIds.has(p.id))
    .map((p) => decidePass(p, queue, now));
  return [...bookingMatches, ...passMatches];
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

/** Monthly passes currently inside the car park. */
export function parkedPassesNow(manifest: Manifest, queue: readonly QueuedEvent[]): ManifestPass[] {
  return (manifest.passes ?? []).filter((p) => {
    const local = localPassStatus(p.id, queue);
    return local.lastAction === 'IN' || (local.lastAction === null && p.inLot);
  });
}
