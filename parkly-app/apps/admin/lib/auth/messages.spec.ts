import { describe, expect, it } from 'vitest';
import { signInErrorMessage } from './messages';

describe('signInErrorMessage', () => {
  it('never reveals whether the account exists', () => {
    expect(signInErrorMessage({ code: 'invalid_credentials', status: 400 })).toMatch(/incorrect/);
    expect(signInErrorMessage({ code: 'email_not_confirmed', status: 400 })).toMatch(/incorrect/);
  });

  it('says to wait when locked out', () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/wait a few minutes/);
  });

  it('asks for the security check again when the captcha fails, not for the password', () => {
    expect(signInErrorMessage({ code: 'captcha_failed', status: 400 })).toMatch(/security check/);
  });
});
