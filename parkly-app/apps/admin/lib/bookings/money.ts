/**
 * "1,500.50" or "₦1500" from a form → kobo, without floating point; null when
 * it isn't a positive amount with at most two decimals. The API checks again.
 */
export function nairaToKobo(input: string): number | null {
  const s = input.trim().replace(/^₦/, '').replace(/,/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return kobo > 0 ? kobo : null;
}

// Mirror the API rules so the page only shows what the role can do; the API enforces them.
const CANCELLERS = new Set(['ADMIN_SUPPORT', 'ADMIN_OPS', 'ADMIN_FINANCE', 'SUPER_ADMIN']);
const REFUNDERS = new Set(['ADMIN_FINANCE', 'SUPER_ADMIN']);
export const canCancel = (roles: { role: string }[]) => roles.some((r) => CANCELLERS.has(r.role));
export const canRefund = (roles: { role: string }[]) => roles.some((r) => REFUNDERS.has(r.role));
