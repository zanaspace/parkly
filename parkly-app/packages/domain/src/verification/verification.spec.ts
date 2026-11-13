import { describe, expect, it } from 'vitest';

import {
  checkVerifiedDriverGate,
  maskIdentityNumber,
  validateVerificationInput,
} from './verification.js';

describe('validateVerificationInput', () => {
  it('validates FRSC driver license format and DOB >= 18', () => {
    expect(
      validateVerificationInput({
        method: 'FRSC_LICENSE',
        idNumber: 'akw-06968-aa2',
        dateOfBirth: '1994-06-15',
        todayLagos: '2026-04-01',
      }),
    ).toEqual({
      ok: true,
      normalisedId: 'AKW06968AA2',
      maskedId: 'AKW******A2',
    });
  });

  it('rejects invalid FRSC license format, missing DOB, or underage driver', () => {
    expect(
      validateVerificationInput({
        method: 'FRSC_LICENSE',
        idNumber: '12345',
        dateOfBirth: '1994-06-15',
      }),
    ).toEqual({ ok: false, reason: 'INVALID_LICENSE_FORMAT' });

    expect(
      validateVerificationInput({
        method: 'FRSC_LICENSE',
        idNumber: 'LAG123456AA',
      }),
    ).toEqual({ ok: false, reason: 'DOB_REQUIRED' });

    expect(
      validateVerificationInput({
        method: 'FRSC_LICENSE',
        idNumber: 'LAG123456AA',
        dateOfBirth: '1999-99-99',
      }),
    ).toEqual({ ok: false, reason: 'DOB_REQUIRED' });

    expect(
      validateVerificationInput({
        method: 'FRSC_LICENSE',
        idNumber: 'LAG123456AA',
        dateOfBirth: '2012-05-01',
        todayLagos: '2026-04-01',
      }),
    ).toEqual({ ok: false, reason: 'UNDERAGE_DRIVER' });

    expect(
      validateVerificationInput({
        method: 'FRSC_LICENSE',
        idNumber: 'LAG123456AA',
        dateOfBirth: '1990-01-01',
        todayLagos: '2026-04-01',
      }),
    ).toEqual({ ok: true, normalisedId: 'LAG123456AA', maskedId: 'LAG******AA' });
  });

  it('validates 11-digit NIN format', () => {
    expect(
      validateVerificationInput({
        method: 'NIN_PHONE',
        idNumber: '1234 5678 901',
      }),
    ).toEqual({
      ok: true,
      normalisedId: '12345678901',
      maskedId: '123******01',
    });

    expect(
      validateVerificationInput({
        method: 'NIN_PHONE',
        idNumber: '12345',
      }),
    ).toEqual({ ok: false, reason: 'INVALID_NIN_FORMAT' });
  });
});

describe('maskIdentityNumber', () => {
  it('masks short and standard IDs safely', () => {
    expect(maskIdentityNumber('AB12')).toBe('****');
    expect(maskIdentityNumber('LAG123456AA')).toBe('LAG******AA');
  });
});

describe('checkVerifiedDriverGate', () => {
  it('blocks unverified drivers on gated lots or gated monthly passes', () => {
    expect(
      checkVerifiedDriverGate({
        lotRequiresVerifiedDriver: true,
        isVerifiedDriver: false,
      }),
    ).toEqual({ ok: false, reason: 'DRIVER_VERIFICATION_REQUIRED' });

    expect(
      checkVerifiedDriverGate({
        lotRequiresVerifiedDriver: false,
        passRequiresVerifiedDriver: true,
        isMonthlyPass: true,
        isVerifiedDriver: false,
      }),
    ).toEqual({ ok: false, reason: 'DRIVER_VERIFICATION_REQUIRED' });

    expect(
      checkVerifiedDriverGate({
        lotRequiresVerifiedDriver: true,
        isVerifiedDriver: true,
      }),
    ).toEqual({ ok: true });

    expect(
      checkVerifiedDriverGate({
        lotRequiresVerifiedDriver: false,
        isVerifiedDriver: false,
      }),
    ).toEqual({ ok: true });
  });
});
