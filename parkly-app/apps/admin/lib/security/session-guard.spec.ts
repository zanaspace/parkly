import { describe, expect, it } from 'vitest';
import { isSignedOutPath, networkAllowed, sessionDecision } from './session-guard';

const NOW = 1_800_000_000_000;
const min = (n: number) => String(NOW - n * 60_000);

describe('admin session decision', () => {
  it('starts a new session now when there are no cookies', () => {
    expect(sessionDecision({}, NOW)).toEqual({ state: 'ok', startedMs: NOW });
  });

  it('carries on while active, and keeps the original start', () => {
    expect(sessionDecision({ seen: min(3), start: min(90) }, NOW)).toEqual({
      state: 'ok',
      startedMs: NOW - 90 * 60_000,
    });
  });

  it('ends a session idle for more than 15 minutes', () => {
    expect(sessionDecision({ seen: min(15), start: min(90) }, NOW).state).toBe('ok');
    expect(sessionDecision({ seen: min(16), start: min(90) }, NOW).state).toBe('idle');
  });

  it('ends a session after 12 hours however active', () => {
    expect(sessionDecision({ seen: min(1), start: min(12 * 60 + 1) }, NOW).state).toBe('expired');
    expect(sessionDecision({ seen: min(1), start: min(12 * 60) }, NOW).state).toBe('ok');
  });

  it('treats a cookie that is not a time as missing, so tampering cannot extend anything', () => {
    expect(sessionDecision({ seen: 'soon', start: '-5' }, NOW)).toEqual({
      state: 'ok',
      startedMs: NOW,
    });
    expect(sessionDecision({ seen: '99', start: min(10) }, NOW).state).toBe('ok');
  });
});

describe('admin network', () => {
  it('is open when no list is set', () => {
    expect(networkAllowed('', '192.0.2.1')).toBe(true);
    expect(networkAllowed(undefined, null)).toBe(true);
  });

  it('lets a listed address through and refuses the rest, using the first forwarded address', () => {
    expect(networkAllowed('203.0.113.0/24', '203.0.113.7, 10.0.0.1')).toBe(true);
    expect(networkAllowed('203.0.113.0/24', '192.0.2.1')).toBe(false);
    expect(networkAllowed('203.0.113.0/24', '10.0.0.1, 203.0.113.7')).toBe(false);
    expect(networkAllowed('203.0.113.0/24', null)).toBe(false);
  });

  it('refuses everyone when the list has an entry it cannot read', () => {
    expect(networkAllowed('203.0.113.7, office-wifi', '203.0.113.7')).toBe(false);
  });
});

describe('signed-out paths', () => {
  it('keeps sign-in, password reset and auth callbacks reachable', () => {
    for (const p of ['/sign-in', '/reset-password', '/update-password', '/auth/confirm'])
      expect(isSignedOutPath(p)).toBe(true);
    for (const p of ['/', '/bookings', '/mfa/verify', '/settings'])
      expect(isSignedOutPath(p)).toBe(false);
  });
});
