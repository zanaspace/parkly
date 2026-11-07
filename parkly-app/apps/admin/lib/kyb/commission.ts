/** The rates an admin may set: 10–15% (doc 00 §3.9). */
export const COMMISSION_MIN_PERCENT = 10;
export const COMMISSION_MAX_PERCENT = 15;

/**
 * "12.5" from the form → 1250 basis points, or null when it isn't a number
 * from 10 to 15 with at most two decimals. The API checks again.
 */
export function percentToBps(input: string): number | null {
  const s = input.trim().replace(/%$/, '');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return bps >= COMMISSION_MIN_PERCENT * 100 && bps <= COMMISSION_MAX_PERCENT * 100 ? bps : null;
}
