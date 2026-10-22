import { describe, expect, it } from 'vitest';
import {
  checkPlate,
  emailFromInput,
  formatPhone,
  nameError,
  phoneFromInput,
  platformFor,
  sanitiseOtp,
} from './forms';

describe('emailFromInput (ADR 0015)', () => {
  it('trims and lower-cases a valid address', () => {
    expect(emailFromInput('  Ada@Example.COM ')).toBe('ada@example.com');
  });
  it.each(['', 'ada', 'ada@', 'ada@example', 'a b@example.com', '@example.com'])(
    'rejects %j',
    (input) => {
      expect(emailFromInput(input)).toBeNull();
    },
  );
});

describe('phoneFromInput (D-02, +234 prefix shown)', () => {
  it.each([
    ['803 123 4567', '+2348031234567'],
    ['08031234567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['9051234567', '+2349051234567'],
  ])('%j → %s', (input, e164) => {
    expect(phoneFromInput(input)).toBe(e164);
  });
  it.each(['', '123', '6031234567', '+14155550123'])('rejects %j', (input) => {
    expect(phoneFromInput(input)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('groups Nigerian numbers', () => {
    expect(formatPhone('+2348031234567')).toBe('+234 803 123 4567');
  });
  it('leaves anything else unchanged', () => {
    expect(formatPhone('+1415')).toBe('+1415');
  });
});

describe('nameError (D-04)', () => {
  it.each(['Ada', "O'Neil", 'Ọlá-Ade', 'Mary Jane'])('accepts %j', (name) => {
    expect(nameError(name, 'First name')).toBeNull();
  });
  it.each([
    ['', 'First name is required.'],
    ['A', 'First name must be at least 2 letters.'],
    ['Ada1', 'First name can only contain letters, spaces, apostrophes and hyphens.'],
    ['Ada 🚗', 'First name can only contain letters, spaces, apostrophes and hyphens.'],
    ['x'.repeat(51), 'First name must be 50 characters or fewer.'],
  ])('rejects %j', (name, message) => {
    expect(nameError(name, 'First name')).toBe(message);
  });
});

describe('checkPlate (D-05)', () => {
  it('previews the normalised plate', () => {
    expect(checkPlate(' lnd 123-ab ')).toEqual({ normalised: 'LND123AB', valid: true });
    expect(checkPlate('ABCDE')).toEqual({ normalised: 'ABCDE', valid: false });
  });
});

describe('sanitiseOtp', () => {
  it('keeps the first 6 digits', () => {
    expect(sanitiseOtp(' 12-34 56 78')).toBe('123456');
    expect(sanitiseOtp('ab1')).toBe('1');
  });
});

describe('platformFor', () => {
  it.each([
    ['android', 'ANDROID'],
    ['ios', 'IOS'],
    ['web', 'WEB'],
  ])('%s → %s', (os, platform) => {
    expect(platformFor(os)).toBe(platform);
  });
});
