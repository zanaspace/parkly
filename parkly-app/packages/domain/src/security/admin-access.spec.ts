import { describe, expect, it } from 'vitest';
import {
  adminSessionState,
  ipAllowed,
  parseAllowlist,
  stepUpFresh,
  type AllowRule,
} from './admin-access.js';

const rules = (text: string): AllowRule[] => parseAllowlist(text).rules;

describe('network allowlist', () => {
  it('is off when nothing is listed', () => {
    expect(ipAllowed('203.0.113.7', [])).toBe(true);
    expect(ipAllowed(null, [])).toBe(true);
  });

  it('lets a listed address and a listed range through, and nobody else', () => {
    const r = rules('203.0.113.7, 198.51.100.0/24');
    expect(ipAllowed('203.0.113.7', r)).toBe(true);
    expect(ipAllowed('203.0.113.8', r)).toBe(false);
    expect(ipAllowed('198.51.100.1', r)).toBe(true);
    expect(ipAllowed('198.51.100.255', r)).toBe(true);
    expect(ipAllowed('198.51.101.1', r)).toBe(false);
  });

  it('handles /32, /0 and an IPv4 address that arrives mapped into IPv6', () => {
    expect(ipAllowed('10.0.0.5', rules('10.0.0.5/32'))).toBe(true);
    expect(ipAllowed('10.0.0.6', rules('10.0.0.5/32'))).toBe(false);
    expect(ipAllowed('8.8.8.8', rules('0.0.0.0/0'))).toBe(true);
    expect(ipAllowed('::ffff:203.0.113.7', rules('203.0.113.7'))).toBe(true);
  });

  it('matches an IPv6 address exactly, ignoring case', () => {
    const r = rules('2001:db8::1');
    expect(ipAllowed('2001:DB8::1', r)).toBe(true);
    expect(ipAllowed('2001:db8::2', r)).toBe(false);
  });

  it('never lets an address through that it could not read', () => {
    const r = rules('203.0.113.7');
    expect(ipAllowed(null, r)).toBe(false);
    expect(ipAllowed('', r)).toBe(false);
    expect(ipAllowed('unknown', r)).toBe(false);
    expect(ipAllowed('999.1.1.1', r)).toBe(false);
  });

  it('names entries it cannot read instead of dropping them quietly', () => {
    const parsed = parseAllowlist('203.0.113.7, 10.0.0.0/33, nonsense, 300.1.1.1, ,');
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.invalid).toEqual(['10.0.0.0/33', 'nonsense', '300.1.1.1']);
    expect(parseAllowlist(undefined)).toEqual({ rules: [], invalid: [] });
    expect(parseAllowlist('  \n ')).toEqual({ rules: [], invalid: [] });
  });
});

describe('admin session', () => {
  const T = Date.UTC(2026, 10, 12, 9, 0, 0);
  const min = (n: number) => n * 60_000;

  it('is fine for a new session and for recent activity', () => {
    expect(adminSessionState({ lastSeenMs: null, startedMs: null, nowMs: T })).toBe('ok');
    expect(adminSessionState({ lastSeenMs: T - min(14), startedMs: T - min(60), nowMs: T })).toBe(
      'ok',
    );
  });

  it('ends after 15 minutes idle', () => {
    expect(adminSessionState({ lastSeenMs: T - min(15), startedMs: T - min(60), nowMs: T })).toBe(
      'ok',
    );
    expect(adminSessionState({ lastSeenMs: T - min(16), startedMs: T - min(60), nowMs: T })).toBe(
      'idle',
    );
  });

  it('ends after 12 hours however active, and that wins over idle', () => {
    const start = T - 12 * 3_600_000 - 1000;
    expect(adminSessionState({ lastSeenMs: T - min(1), startedMs: start, nowMs: T })).toBe(
      'expired',
    );
    expect(adminSessionState({ lastSeenMs: T - min(60), startedMs: start, nowMs: T })).toBe(
      'expired',
    );
    expect(
      adminSessionState({ lastSeenMs: T - min(1), startedMs: T - 12 * 3_600_000, nowMs: T }),
    ).toBe('ok');
  });

  it('takes other limits when given', () => {
    expect(
      adminSessionState({ lastSeenMs: T - min(6), startedMs: null, nowMs: T, idleMinutes: 5 }),
    ).toBe('idle');
  });
});

describe('step-up', () => {
  const now = 1_800_000_000_000;
  const sec = now / 1000;

  it('needs an authenticator-app check from the last 5 minutes', () => {
    expect(stepUpFresh([{ method: 'totp', timestamp: sec - 10 }], now)).toBe(true);
    expect(stepUpFresh([{ method: 'totp', timestamp: sec - 300 }], now)).toBe(true);
    expect(stepUpFresh([{ method: 'totp', timestamp: sec - 301 }], now)).toBe(false);
  });

  it('is not met by a password or no check, or when there is no list at all', () => {
    expect(stepUpFresh([{ method: 'password', timestamp: sec - 5 }], now)).toBe(false);
    expect(stepUpFresh([], now)).toBe(false);
    expect(stepUpFresh(undefined, now)).toBe(false);
  });

  it('uses the newest authenticator check', () => {
    const amr = [
      { method: 'totp', timestamp: sec - 3600 },
      { method: 'password', timestamp: sec - 20 },
      { method: 'totp', timestamp: sec - 30 },
    ];
    expect(stepUpFresh(amr, now)).toBe(true);
    expect(stepUpFresh(amr, now, 20)).toBe(false);
  });
});
