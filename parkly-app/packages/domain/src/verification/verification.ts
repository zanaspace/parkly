export const VERIFICATION_METHODS = ['FRSC_LICENSE', 'NIN_PHONE'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const VERIFICATION_STATUSES = ['VERIFIED', 'REJECTED', 'FAILED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

const FRSC_LICENSE_RE = /^[A-Z]{3}[0-9]{5,9}[A-Z]{0,2}[0-9]{0,2}$/;
const NIN_RE = /^[0-9]{11}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidateVerificationInput {
  method: VerificationMethod;
  idNumber: string;
  dateOfBirth?: string;
  /** YYYY-MM-DD in Africa/Lagos (optional, used to check age >= 18) */
  todayLagos?: string;
}

export type ValidateVerificationResult =
  | {
      ok: true;
      normalisedId: string;
      maskedId: string;
    }
  | {
      ok: false;
      reason: 'INVALID_LICENSE_FORMAT' | 'INVALID_NIN_FORMAT' | 'DOB_REQUIRED' | 'UNDERAGE_DRIVER';
    };

/**
 * Masks a sensitive Nigerian identity number for audit / display (keeping only first 3 and last 2 characters).
 */
export function maskIdentityNumber(normalisedId: string): string {
  const clean = normalisedId.trim().toUpperCase();
  if (clean.length <= 5) return '*'.repeat(clean.length);
  return `${clean.slice(0, 3)}${'*'.repeat(clean.length - 5)}${clean.slice(-2)}`;
}

/**
 * Pure validation of Nigerian Driver Identity Verification input (`FR-AUTH-009` Tier 2 KYC):
 * - `FRSC_LICENSE`: 3 state/prefix letters + 5–9 digits + 0–2 suffix letters (e.g. `AKW06968AA2`), requires `dateOfBirth` (must be >= 18 years old).
 * - `NIN_PHONE`: 11-digit National Identification Number (`00000000000`–`99999999999`).
 */
export function validateVerificationInput(
  input: ValidateVerificationInput,
): ValidateVerificationResult {
  const raw = input.idNumber.replace(/[\s-]+/g, '').toUpperCase();

  if (input.method === 'FRSC_LICENSE') {
    if (!FRSC_LICENSE_RE.test(raw)) {
      return { ok: false, reason: 'INVALID_LICENSE_FORMAT' };
    }
    if (!input.dateOfBirth || !DATE_RE.test(input.dateOfBirth)) {
      return { ok: false, reason: 'DOB_REQUIRED' };
    }
    const dobMs = Date.parse(`${input.dateOfBirth}T00:00:00.000Z`);
    if (!Number.isFinite(dobMs)) {
      return { ok: false, reason: 'DOB_REQUIRED' };
    }
    if (input.todayLagos && DATE_RE.test(input.todayLagos)) {
      const todayY = Number(input.todayLagos.slice(0, 4));
      const dobY = Number(input.dateOfBirth.slice(0, 4));
      const hadBirthday = input.todayLagos.slice(5) >= input.dateOfBirth.slice(5);
      const age = todayY - dobY - (hadBirthday ? 0 : 1);
      if (age < 18) {
        return { ok: false, reason: 'UNDERAGE_DRIVER' };
      }
    }
    return {
      ok: true,
      normalisedId: raw,
      maskedId: maskIdentityNumber(raw),
    };
  }

  if (!NIN_RE.test(raw)) {
    return { ok: false, reason: 'INVALID_NIN_FORMAT' };
  }
  return {
    ok: true,
    normalisedId: raw,
    maskedId: maskIdentityNumber(raw),
  };
}

export interface VerifiedDriverGateInput {
  lotRequiresVerifiedDriver: boolean;
  /** Platform setting `pass.requires_verified_driver` (default false) */
  passRequiresVerifiedDriver?: boolean;
  isMonthlyPass?: boolean;
  isVerifiedDriver: boolean;
}

/**
 * Evaluates whether a booking or monthly pass purchase is blocked by the Verified Driver gate (`FR-PASS-005`).
 */
export function checkVerifiedDriverGate(
  input: VerifiedDriverGateInput,
): { ok: true } | { ok: false; reason: 'DRIVER_VERIFICATION_REQUIRED' } {
  const required =
    input.lotRequiresVerifiedDriver ||
    Boolean(input.isMonthlyPass && input.passRequiresVerifiedDriver);
  if (required && !input.isVerifiedDriver) {
    return { ok: false, reason: 'DRIVER_VERIFICATION_REQUIRED' };
  }
  return { ok: true };
}
