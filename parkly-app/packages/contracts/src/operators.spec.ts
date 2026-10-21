import { describe, expect, it } from 'vitest';
import {
  CacNumberSchema,
  CreateOperatorRequestSchema,
  TinSchema,
  UpdateOperatorRequestSchema,
} from './operators.js';

const valid = {
  legalName: 'Eko Parking Services Ltd',
  tradingName: 'Eko Parking',
  type: 'COMMERCIAL_LOT',
  cacNumber: 'RC 123456',
  addressLine: '12 Adetokunbo Ademola St, Victoria Island, Lagos',
  contactEmail: 'ops@ekoparking.ng',
  contactPhone: '0803 123 4567',
  agreementVersion: '2026-10-01',
};

describe('operator business details (FR-LOT-001, doc 03 O-03)', () => {
  it('accepts a complete request', () => {
    expect(CreateOperatorRequestSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['RC 123456', 'rc123456', 'BN-1234567', 'IT 12345', 'LLP 1234'])(
    'accepts CAC number %s',
    (cac) => {
      expect(CacNumberSchema.safeParse(cac).success).toBe(true);
    },
  );

  it.each(['123456', 'RC', 'XX 123456', 'RC 12', 'RC 123456789'])(
    'rejects CAC number %s',
    (cac) => {
      expect(CacNumberSchema.safeParse(cac).success).toBe(false);
    },
  );

  it.each(['12345678-0001', '123456780001', '12345678', '1234567890'])('accepts TIN %s', (tin) => {
    expect(TinSchema.safeParse(tin).success).toBe(true);
  });

  it.each(['1234567', 'ABC12345', '12345678-01'])('rejects TIN %s', (tin) => {
    expect(TinSchema.safeParse(tin).success).toBe(false);
  });

  it('requires the agreement version and the core fields', () => {
    const { agreementVersion: _a, ...noAgreement } = valid;
    expect(CreateOperatorRequestSchema.safeParse(noAgreement).success).toBe(false);
    expect(CreateOperatorRequestSchema.safeParse({ ...valid, legalName: 'X' }).success).toBe(false);
    expect(CreateOperatorRequestSchema.safeParse({ ...valid, contactEmail: 'nope' }).success).toBe(
      false,
    );
    expect(CreateOperatorRequestSchema.safeParse({ ...valid, type: 'BANK' }).success).toBe(false);
  });

  it('allows partial updates but not empty ones', () => {
    expect(UpdateOperatorRequestSchema.safeParse({ tradingName: 'Eko Park VI' }).success).toBe(
      true,
    );
    expect(UpdateOperatorRequestSchema.safeParse({}).success).toBe(false);
  });
});
