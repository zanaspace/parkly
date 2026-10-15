import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE, messageForCode } from './errors';

describe('messageForCode', () => {
  it('maps known codes to friendly copy', () => {
    expect(messageForCode('VEHICLE_DUPLICATE')).toBe('This plate is already on your account.');
    expect(messageForCode('OTP_RATE_LIMITED')).toMatch(/wait/);
  });
  it('falls back for unknown or missing codes', () => {
    expect(messageForCode('SOMETHING_NEW')).toBe(GENERIC_ERROR_MESSAGE);
    expect(messageForCode(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
