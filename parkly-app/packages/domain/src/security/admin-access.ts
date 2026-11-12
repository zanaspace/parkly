/**
 * Admin console hardening (doc 05 section 4.6, S8 task 7): which networks may reach
 * the admin API, how long an admin session may sit idle, and when an action that
 * changes money or rules needs a fresh two-step check. All pure, so the API and the
 * admin app apply exactly the same rules.
 */

// --- network allowlist -------------------------------------------------------------

export type AllowRule =
  { kind: 'ipv4'; base: number; mask: number } | { kind: 'exact'; value: string };

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToInt(ip: string): number | null {
  const m = IPV4.exec(ip);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return (
    (((parts[0] ?? 0) << 24) |
      ((parts[1] ?? 0) << 16) |
      ((parts[2] ?? 0) << 8) |
      (parts[3] ?? 0)) >>>
    0
  );
}

/** Turns "203.0.113.7, 198.51.100.0/24, 2001:db8::1" into rules. Unreadable entries are named, not skipped. */
export function parseAllowlist(text: string | undefined): {
  rules: AllowRule[];
  invalid: string[];
} {
  const rules: AllowRule[] = [];
  const invalid: string[] = [];
  for (const raw of (text ?? '').split(/[,\s]+/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const [addr = '', bits] = entry.split('/');
    const asInt = ipv4ToInt(addr);
    if (asInt !== null) {
      const len = bits === undefined ? 32 : Number(bits);
      if (!Number.isInteger(len) || len < 0 || len > 32) {
        invalid.push(entry);
        continue;
      }
      const mask = len === 0 ? 0 : (~0 << (32 - len)) >>> 0;
      rules.push({ kind: 'ipv4', base: (asInt & mask) >>> 0, mask });
    } else if (bits === undefined && /^[0-9a-f:]+$/i.test(addr) && addr.includes(':')) {
      rules.push({ kind: 'exact', value: addr.toLowerCase() });
    } else {
      invalid.push(entry);
    }
  }
  return { rules, invalid };
}

/**
 * No rules means the allowlist is switched off (local and dev). With rules, only a
 * listed address passes, and an address we couldn't read never does.
 */
export function ipAllowed(ip: string | null | undefined, rules: readonly AllowRule[]): boolean {
  if (rules.length === 0) return true;
  if (!ip) return false;
  const value = ip
    .trim()
    .toLowerCase()
    .replace(/^::ffff:/, '');
  const asInt = ipv4ToInt(value);
  return rules.some((r) =>
    r.kind === 'ipv4' ? asInt !== null && (asInt & r.mask) >>> 0 === r.base : r.value === value,
  );
}

// --- admin session -----------------------------------------------------------------

/** Doc 20 S8 task 7 says 15 minutes (doc 05 says 30); the shorter one applies. */
export const ADMIN_IDLE_MINUTES = 15;
/** Doc 05 section 4.6: 12 hours whatever the activity. */
export const ADMIN_MAX_SESSION_HOURS = 12;

export type AdminSessionState = 'ok' | 'idle' | 'expired';

export function adminSessionState(input: {
  /** When the admin last used the console (ms), or null for a brand new session. */
  lastSeenMs: number | null;
  /** When this sign-in began (ms), or null for a brand new session. */
  startedMs: number | null;
  nowMs: number;
  idleMinutes?: number;
  maxHours?: number;
}): AdminSessionState {
  const idleMs = (input.idleMinutes ?? ADMIN_IDLE_MINUTES) * 60_000;
  const maxMs = (input.maxHours ?? ADMIN_MAX_SESSION_HOURS) * 3_600_000;
  if (input.startedMs !== null && input.nowMs - input.startedMs > maxMs) return 'expired';
  if (input.lastSeenMs !== null && input.nowMs - input.lastSeenMs > idleMs) return 'idle';
  return 'ok';
}

// --- step-up ----------------------------------------------------------------------

/** Doc 05 section 4.6: a four-eyes approval needs a two-step check from the last 5 minutes. */
export const STEP_UP_MAX_AGE_SEC = 300;

export type AuthMethodRef = { method: string; timestamp: number };

/**
 * Supabase lists every way a session was verified in the token's `amr` claim, each
 * with the time (seconds). A fresh authenticator-app check is one of those, from the
 * last `maxAgeSec`. The time comes from the signed token, so it can't be backdated.
 */
export function stepUpFresh(
  amr: readonly AuthMethodRef[] | undefined,
  nowMs: number,
  maxAgeSec: number = STEP_UP_MAX_AGE_SEC,
): boolean {
  const latest = (amr ?? [])
    .filter((a) => a.method === 'totp')
    .reduce((max, a) => Math.max(max, a.timestamp), 0);
  return latest > 0 && nowMs / 1000 - latest <= maxAgeSec;
}
