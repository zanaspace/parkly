import type { IdentityVerificationOutcome, IdentityVerificationProvider } from './index.js';

/**
 * Nigerian Identity Verification adapter (Dojah KYB/KYC API v1 — `FR-AUTH-009` Tier 2 KYC).
 * Supports:
 * - `FRSC_LICENSE`: `/api/v1/kyc/dl` (Driver's License lookup + DOB match)
 * - `NIN_PHONE`: `/api/v1/kyc/nin` (11-digit NIN lookup + phone last-4 match when available)
 *
 * Raw document images or full registry payloads are never persisted (NDPA data minimisation, doc 06 §3.1).
 */
type DojahResponse = {
  entity?: {
    uuid?: string;
    license_no?: string;
    nin?: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    birth_date?: string;
    date_of_birth?: string;
    phone_number?: string;
  };
  error?: string;
};

export function dojahIdentityProvider(opts: {
  appId: string;
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): IdentityVerificationProvider {
  const base = (opts.baseUrl ?? 'https://api.dojah.io').replace(/\/$/, '');
  const fetchFn = opts.fetchImpl ?? fetch;

  return {
    name: 'dojah',

    async verifyDriver(input): Promise<IdentityVerificationOutcome> {
      const path =
        input.method === 'FRSC_LICENSE'
          ? `/api/v1/kyc/dl?license_number=${encodeURIComponent(input.idNumber)}`
          : `/api/v1/kyc/nin?nin=${encodeURIComponent(input.idNumber)}`;

      let res: Response;
      try {
        res = await fetchFn(`${base}${path}`, {
          method: 'GET',
          headers: {
            AppId: opts.appId,
            Authorization: opts.secretKey,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        throw new Error(`Dojah network error: ${(err as Error).message}`, { cause: err });
      }

      if (res.status === 404 || res.status === 422 || res.status === 400) {
        return {
          verified: false,
          providerReference: `dojah_rejected_${Date.now()}`,
          verifiedName: null,
          rejectionReason: 'Identity number not found in Nigerian registry',
        };
      }

      if (!res.ok) {
        throw new Error(`Dojah HTTP ${res.status}`);
      }

      const body = (await res.json().catch(() => null)) as DojahResponse | null;
      const entity = body?.entity;
      if (!entity) {
        return {
          verified: false,
          providerReference: `dojah_empty_${Date.now()}`,
          verifiedName: null,
          rejectionReason: body?.error ?? 'No identity entity returned',
        };
      }

      const providerReference = entity.uuid ?? `dojah_${input.method.toLowerCase()}_${Date.now()}`;
      const fullName = [entity.first_name, entity.middle_name, entity.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (input.method === 'FRSC_LICENSE' && input.dateOfBirth) {
        const registryDob = (entity.birth_date ?? entity.date_of_birth ?? '').slice(0, 10);
        if (registryDob && registryDob !== input.dateOfBirth) {
          return {
            verified: false,
            providerReference,
            verifiedName: null,
            rejectionReason: 'Date of birth did not match FRSC driver license record',
          };
        }
      }

      if (input.method === 'NIN_PHONE' && input.phoneLast4 && entity.phone_number) {
        const cleanPhone = entity.phone_number.replace(/\D/g, '');
        if (cleanPhone.length >= 4 && !cleanPhone.endsWith(input.phoneLast4)) {
          return {
            verified: false,
            providerReference,
            verifiedName: null,
            rejectionReason: 'NIN phone number did not match registered account phone',
          };
        }
      }

      return {
        verified: true,
        providerReference,
        verifiedName: fullName || 'VERIFIED DRIVER',
        rejectionReason: null,
      };
    },
  };
}
