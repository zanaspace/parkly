import type { Booking } from '@parkly/contracts';

/**
 * Which scan check-in/out action the booking can take now (barrier poster or attendant phone).
 * Available for any confirmed/active stay.
 */
export function selfCheckKind(b: Booking): 'in' | 'out' | null {
  if (b.status === 'CONFIRMED' && !b.stay?.checkedInAt) return 'in';
  if (b.status === 'CHECKED_IN' && !b.stay?.checkedOutAt) return 'out';
  return null;
}

/** Same radius as the API's geofence (ADR 0016). */
const SELF_CHECK_RADIUS_M = 150;

/**
 * Why this position can't be used to check in, or null (gap review G-1): a
 * fake-location app, or a fix too rough to tell whether the phone is at the lot.
 */
export function positionProblem(pos: {
  mocked?: boolean;
  coords: { accuracy: number | null };
}): string | null {
  if (pos.mocked) return 'Turn off any fake-location app, then scan again.';
  if (pos.coords.accuracy === null || pos.coords.accuracy > SELF_CHECK_RADIUS_M)
    return 'Your location isn’t precise enough. Step outside or wait a moment, then scan again.';
  return null;
}

/** "11:30" in Lagos. */
const lagosTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  });

/**
 * ADR 0023: before the gate accepts the car, say when it will instead of
 * offering a check-in that would be refused. Null once check-in is open (or
 * an older API gave no time, when the server still decides).
 */
export function checkInNotYet(b: Booking, now: number): string | null {
  if (!b.checkInOpensAt || now >= Date.parse(b.checkInOpensAt)) return null;
  const early = Math.round((Date.parse(b.startAt) - Date.parse(b.checkInOpensAt)) / 60_000);
  return `Check-in opens at ${lagosTime(b.checkInOpensAt)} (${early} minutes before your booking).`;
}

/** The gate refused the time (QR_OUTSIDE_WINDOW): say which way, with the time. */
export function outsideWindowMessage(b: Booking, now: number): string {
  if (now < Date.parse(b.endAt) && b.checkInOpensAt)
    return `You’re early. You can check in from ${lagosTime(b.checkInOpensAt)}.`;
  return `This booking ended at ${lagosTime(b.endAt)}.`;
}
