import { describe, expect, it } from 'vitest';
import { filterRates, readQuery } from './rates';

const rate = (tradingName: string, legalName: string) => ({
  operatorId: '0192e220-0000-7000-8000-000000000001',
  tradingName,
  legalName,
  kybStatus: 'APPROVED' as const,
  commissionBps: 1200,
});
const RATES = [
  rate('Eko Parking', 'Eko Parking Services Ltd'),
  rate('Lekki Prime', 'Lékki Prime Parking Ltd'),
  rate('My park', 'Sellytics'),
];

describe('commission rate search', () => {
  it('keeps everyone with no search', () => {
    expect(filterRates(RATES, '')).toHaveLength(3);
    expect(filterRates(RATES, '   ')).toHaveLength(3);
  });

  it('matches trading or legal name, any case, every word', () => {
    expect(filterRates(RATES, 'eko').map((r) => r.tradingName)).toEqual(['Eko Parking']);
    expect(filterRates(RATES, 'SELLY').map((r) => r.tradingName)).toEqual(['My park']);
    expect(filterRates(RATES, 'parking ltd')).toHaveLength(2);
    expect(filterRates(RATES, 'eko lekki')).toHaveLength(0);
  });

  it('ignores accents', () => {
    expect(filterRates(RATES, 'lekki').map((r) => r.tradingName)).toEqual(['Lekki Prime']);
  });

  it('reads the search param', () => {
    expect(readQuery({ q: '  eko ' })).toBe('eko');
    expect(readQuery({ q: ['eko'] })).toBe('');
    expect(readQuery({})).toBe('');
  });
});
