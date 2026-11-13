import {
  adminSessionState,
  ipAllowed,
  parseAllowlist,
  type AdminSessionState,
} from '@parkly/domain';

/**
 * Admin hardening in the admin app (doc 05 section 4.6, S8 task 7). `proxy.ts` calls these on
 * every request; they hold no Next specifics, so they can be tested directly.
 */

export const SEEN_COOKIE = 'pk_admin_seen';
export const START_COOKIE = 'pk_admin_start';

const toMs = (value: string | undefined): number | null => {
  if (!value || !/^\d{10,15}$/.test(value)) return null;
  return Number(value);
};

/**
 * Where an admin's session stands: idle for more than 15 minutes, or older than 12 hours.
 * `startedMs` is when this sign-in began, kept so the 12 hours can't be extended by activity.
 * No cookies yet means a new sign-in, which starts now.
 */
export function sessionDecision(
  cookies: { seen?: string; start?: string },
  nowMs: number,
): { state: AdminSessionState; startedMs: number } {
  const startedMs = toMs(cookies.start);
  const state = adminSessionState({ lastSeenMs: toMs(cookies.seen), startedMs, nowMs });
  return { state, startedMs: startedMs ?? nowMs };
}

/**
 * The console only opens from the allowed networks (empty list = off). The address is the
 * first one in `x-forwarded-for`, which Vercel sets. A list with a typo refuses everyone
 * rather than quietly letting everyone in.
 */
export function networkAllowed(
  allowlist: string | undefined,
  forwardedFor: string | null,
): boolean {
  const { rules, invalid } = parseAllowlist(allowlist);
  if (invalid.length > 0) return false;
  const ip = forwardedFor?.split(',')[0]?.trim() || null;
  return ipAllowed(ip, rules);
}

/** Paths that must still work for someone with no session or an ended one. */
export function isSignedOutPath(pathname: string): boolean {
  return (
    pathname === '/sign-in' ||
    pathname === '/reset-password' ||
    pathname === '/update-password' ||
    pathname.startsWith('/auth/')
  );
}
