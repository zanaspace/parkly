import { describe, expect, it } from 'vitest';
import { parseProblem } from './api';
import { authErrorMessage, signInErrorMessage } from './auth/messages';

describe('parseProblem', () => {
  it('keeps known problem codes and detail', () => {
    const p = parseProblem(403, { code: 'AUTH_MFA_REQUIRED', detail: 'step up' });
    expect([p.status, p.code, p.detail]).toEqual([403, 'AUTH_MFA_REQUIRED', 'step up']);
  });

  it('maps unknown codes and non-JSON bodies to UNKNOWN', () => {
    expect(parseProblem(500, { code: 'MADE_UP' }).code).toBe('UNKNOWN');
    expect(parseProblem(502, null).code).toBe('UNKNOWN');
    expect(parseProblem(502, 'Bad gateway').code).toBe('UNKNOWN');
  });
});

describe('sign-in error copy (no account enumeration)', () => {
  it('gives the same message for wrong password, unknown user and unconfirmed email', () => {
    const msgs = [
      signInErrorMessage({ code: 'invalid_credentials', status: 400 }),
      signInErrorMessage({ code: 'user_not_found', status: 400 }),
      signInErrorMessage({ code: 'email_not_confirmed', status: 400 }),
      signInErrorMessage({}),
    ];
    expect(new Set(msgs).size).toBe(1);
  });

  it('tells rate-limited users to wait', () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/wait/i);
  });

  it('maps MFA failures to authenticator copy', () => {
    expect(authErrorMessage({ code: 'mfa_verification_failed' })).toMatch(/authenticator/i);
  });
});
