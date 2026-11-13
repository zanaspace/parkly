import { describe, expect, it } from 'vitest';

import { dojahIdentityProvider } from './dojah-identity.js';

describe('dojahIdentityProvider (FR-AUTH-009)', () => {
  it('verifies FRSC driver license when DOB matches', async () => {
    const provider = dojahIdentityProvider({
      appId: 'app_test',
      secretKey: 'sec_test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            entity: {
              uuid: 'dojah-ref-001',
              license_no: 'AKW06968AA2',
              first_name: 'ADAOBI',
              last_name: 'NWOSU',
              birth_date: '1994-06-15',
            },
          }),
          { status: 200 },
        ),
    });

    const res = await provider.verifyDriver({
      method: 'FRSC_LICENSE',
      idNumber: 'AKW06968AA2',
      dateOfBirth: '1994-06-15',
    });

    expect(res).toEqual({
      verified: true,
      providerReference: 'dojah-ref-001',
      verifiedName: 'ADAOBI NWOSU',
      rejectionReason: null,
    });
  });

  it('rejects FRSC license when DOB does not match', async () => {
    const provider = dojahIdentityProvider({
      appId: 'app_test',
      secretKey: 'sec_test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            entity: {
              uuid: 'dojah-ref-002',
              license_no: 'AKW06968AA2',
              first_name: 'ADAOBI',
              last_name: 'NWOSU',
              birth_date: '1990-01-01',
            },
          }),
          { status: 200 },
        ),
    });

    const res = await provider.verifyDriver({
      method: 'FRSC_LICENSE',
      idNumber: 'AKW06968AA2',
      dateOfBirth: '1994-06-15',
    });

    expect(res.verified).toBe(false);
    expect(res.rejectionReason).toMatch(/Date of birth/);
  });

  it('verifies NIN with phone last-4 match and rejects mismatch', async () => {
    const provider = dojahIdentityProvider({
      appId: 'app_test',
      secretKey: 'sec_test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            entity: {
              uuid: 'dojah-nin-001',
              nin: '12345678901',
              first_name: 'TUNDE',
              last_name: 'BAKARE',
              phone_number: '08031234567',
            },
          }),
          { status: 200 },
        ),
    });

    const ok = await provider.verifyDriver({
      method: 'NIN_PHONE',
      idNumber: '12345678901',
      phoneLast4: '4567',
    });
    expect(ok.verified).toBe(true);

    const mismatch = await provider.verifyDriver({
      method: 'NIN_PHONE',
      idNumber: '12345678901',
      phoneLast4: '9999',
    });
    expect(mismatch.verified).toBe(false);
    expect(mismatch.rejectionReason).toMatch(/phone number/);
  });
});
