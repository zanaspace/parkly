import type { Booking } from '@parkly/contracts';

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
