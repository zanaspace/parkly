import { describe, expect, it } from 'vitest';
import { maskPhone, normaliseNigerianPhone } from './phone.js';

describe('normaliseNigerianPhone → E.164', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['+2349051234567', '+2349051234567'],
    ['07011234567', '+2347011234567'],
    ['(0810) 123-4567', '+2348101234567'],
  ])('%j → %s', (input, e164) => {
    expect(normaliseNigerianPhone(input)).toBe(e164);
  });

  it.each([
    '',
    '12345',
    '0803123456', // too short
    '080312345678', // too long
    '06031234567', // not a mobile prefix
    '+14155550123', // not Nigerian (OTP only to +234, doc 05 §4.1)
    '+2340803123456',
    'abc',
  ])('rejects %j', (input) => {
    expect(normaliseNigerianPhone(input)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('keeps country code and last four digits', () => {
    expect(maskPhone('+2348031234567')).toBe('+234******4567');
  });
  it('fully masks short values', () => {
    expect(maskPhone('0803')).toBe('****');
  });
});
