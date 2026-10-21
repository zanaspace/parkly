import { describe, expect, it } from 'vitest';
import { parseProblem } from '../api';
import { businessFieldErrors, readBusinessForm, OPERATOR_TYPE_OPTIONS } from './form';

const formData = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

const filled = {
  legalName: '  Eko Parking Services Ltd ',
  tradingName: 'Eko Parking',
  type: 'COMMERCIAL_LOT',
  cacNumber: 'RC 123456',
  tin: '',
  addressLine: '12 Adetokunbo Ademola St, VI',
  contactEmail: 'ops@ekoparking.ng',
  contactPhone: '0803 123 4567',
};

describe('readBusinessForm', () => {
  it('trims values and drops an empty optional TIN', () => {
    expect(readBusinessForm(formData(filled))).toEqual({
      legalName: 'Eko Parking Services Ltd',
      tradingName: 'Eko Parking',
      type: 'COMMERCIAL_LOT',
      cacNumber: 'RC 123456',
      addressLine: '12 Adetokunbo Ademola St, VI',
      contactEmail: 'ops@ekoparking.ng',
      contactPhone: '0803 123 4567',
    });
  });

  it('ignores fields that are not business details', () => {
    expect(readBusinessForm(formData({ ...filled, role: 'SUPER_ADMIN' }))).not.toHaveProperty(
      'role',
    );
  });
});

describe('businessFieldErrors (API problem → messages under each field)', () => {
  it('maps validation errors to friendly copy per field', () => {
    const p = parseProblem(400, {
      code: 'VALIDATION_FAILED',
      errors: [
        { path: 'cacNumber', message: 'Use the CAC number format, e.g. RC 123456' },
        { path: 'contactEmail', message: 'Invalid email address' },
      ],
    });
    expect(businessFieldErrors(p)).toEqual({
      cacNumber: 'Use the CAC number format, e.g. RC 123456',
      contactEmail: 'Enter a valid email address.',
    });
  });

  it('puts a rejected phone number under the phone field', () => {
    expect(businessFieldErrors(parseProblem(400, { code: 'AUTH_PHONE_INVALID' }))).toEqual({
      contactPhone: 'Enter a Nigerian mobile number, e.g. 0803 123 4567.',
    });
  });

  it('returns nothing for errors that are not about a field', () => {
    expect(businessFieldErrors(parseProblem(409, { code: 'OPERATOR_DUPLICATE' }))).toEqual({});
  });
});

describe('business types', () => {
  it('offers every operator type with a readable label', () => {
    expect(OPERATOR_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      'HOTEL',
      'OFFICE',
      'COMMERCIAL_LOT',
      'EVENT_CENTRE',
      'OTHER',
    ]);
  });
});
