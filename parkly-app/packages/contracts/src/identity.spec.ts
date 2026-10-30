import { describe, expect, it } from 'vitest';
import { mapSupabaseAuthError } from './auth-errors.js';
import {
  CreateVehicleRequestSchema,
  UpdateMeRequestSchema,
  UpdateVehicleRequestSchema,
} from './identity.js';

describe('identity contracts', () => {
  it('accepts Nigerian and accented names, rejects digits and empty updates', () => {
    expect(UpdateMeRequestSchema.safeParse({ firstName: 'Adaeze' }).success).toBe(true);
    expect(UpdateMeRequestSchema.safeParse({ lastName: "Ọlá-O'Neil" }).success).toBe(true);
    expect(UpdateMeRequestSchema.safeParse({ firstName: 'Ada1' }).success).toBe(false);
    expect(UpdateMeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('requires a plate and trims vehicle text', () => {
    const parsed = CreateVehicleRequestSchema.parse({ plate: ' lnd 123-ab ', make: ' Toyota ' });
    expect(parsed).toEqual({ plate: 'lnd 123-ab', make: 'Toyota' });
    expect(CreateVehicleRequestSchema.safeParse({ make: 'Toyota' }).success).toBe(false);
  });

  it('only allows setting a vehicle as default, not unsetting', () => {
    expect(UpdateVehicleRequestSchema.safeParse({ isDefault: true }).success).toBe(true);
    expect(UpdateVehicleRequestSchema.safeParse({ isDefault: false }).success).toBe(false);
  });
});

describe('mapSupabaseAuthError', () => {
  it.each([
    [{ code: 'otp_expired' }, 'AUTH_OTP_EXPIRED'],
    [{ code: 'over_sms_send_rate_limit' }, 'OTP_RATE_LIMITED'],
    [{ code: 'invalid_credentials' }, 'AUTH_INVALID_CREDENTIALS'],
    [{ code: 'mfa_verification_failed' }, 'AUTH_MFA_INVALID'],
    // Supabase's captcha check (S-4) answers 400 with this code.
    [{ code: 'captcha_failed', status: 400 }, 'AUTH_CAPTCHA_FAILED'],
    [{ status: 403 }, 'AUTH_OTP_INVALID'],
    [{ status: 429 }, 'AUTH_OTP_LOCKED'],
    [{ code: 'something_new', status: 500 }, 'AUTH_UNKNOWN'],
  ] as const)('%j → %s', (err, code) => {
    expect(mapSupabaseAuthError(err)).toBe(code);
  });
});
