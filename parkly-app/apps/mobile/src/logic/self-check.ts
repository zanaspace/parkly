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
