import type { AdminBooking } from '@parkly/contracts';

/** PK-XXXXXX from what support typed: any case, with or without "PK-" and spaces. */
export function bookingCode(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/^PK-?/, '');
  return /^[A-Z0-9]{6}$/.test(raw) ? `PK-${raw}` : null;
}

// Mirrors the API's `overstay:waive` rule; the API enforces it regardless.
const WAIVERS = new Set(['ADMIN_OPS', 'ADMIN_FINANCE', 'SUPER_ADMIN']);
export const canWaive = (roles: { role: string }[]) => roles.some((r) => WAIVERS.has(r.role));

export const overstayOwed = (o: AdminBooking['overstay']) =>
  !!o && (o.status === 'DUE' || o.status === 'UNPAID') && o.amountKobo > 0;
