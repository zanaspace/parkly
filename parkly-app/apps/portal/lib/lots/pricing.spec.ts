import { describe, expect, it } from 'vitest';
import { parseProblem } from '../api';
import { describeLotGaps, priceLabel, readRatePlanForm } from './pricing';

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('readRatePlanForm (naira in, kobo out)', () => {
  it('reads an hourly plan with a minimum stay and an optional daily cap', () => {
    expect(
      readRatePlanForm(
        fd({ product: 'HOURLY', rate: '₦500', minMinutes: '60', dailyCap: '3,000' }),
      ),
    ).toEqual({
      ok: true,
      body: { product: 'HOURLY', hourlyRateKobo: 50_000, minMinutes: 60, dailyCapKobo: 300_000 },
    });
    expect(
      readRatePlanForm(fd({ product: 'HOURLY', rate: '450.50', minMinutes: '120', dailyCap: '' })),
    ).toEqual({
      ok: true,
      body: { product: 'HOURLY', hourlyRateKobo: 45_050, minMinutes: 120 },
    });
  });

  it('reads the optional overstay price and grace on an hourly plan (ADR 0016)', () => {
    expect(
      readRatePlanForm(
        fd({
          product: 'HOURLY',
          rate: '500',
          minMinutes: '60',
          dailyCap: '',
          overstayRate: '200',
          overstayGrace: '20',
        }),
      ),
    ).toEqual({
      ok: true,
      body: {
        product: 'HOURLY',
        hourlyRateKobo: 50_000,
        minMinutes: 60,
        overstayRateKobo: 20_000,
        overstayGraceMin: 20,
      },
    });
    expect(
      readRatePlanForm(fd({ product: 'HOURLY', rate: '500', minMinutes: '60', overstayRate: 'x' })),
    ).toEqual({ ok: false, error: 'Enter the overstay price in naira, or leave it empty.' });
  });

  it('reads daily and monthly plans', () => {
    expect(readRatePlanForm(fd({ product: 'DAILY', rate: '2,500' }))).toEqual({
      ok: true,
      body: { product: 'DAILY', dailyRateKobo: 250_000 },
    });
    expect(readRatePlanForm(fd({ product: 'MONTHLY', rate: '45000' }))).toEqual({
      ok: true,
      body: { product: 'MONTHLY', monthlyRateKobo: 4_500_000 },
    });
  });

  it.each(['', 'five hundred', '-500', '500.555', '0'])('refuses the amount %j', (rate) => {
    expect(readRatePlanForm(fd({ product: 'DAILY', rate })).ok).toBe(false);
  });
});

describe('priceLabel', () => {
  it('shows prices the way operators read them', () => {
    expect(
      priceLabel({
        product: 'HOURLY',
        hourlyRateKobo: 50_000,
        minMinutes: 60,
        dailyCapKobo: 300_000,
        dailyRateKobo: null,
        monthlyRateKobo: null,
      }),
    ).toBe('₦500 per hour (minimum 1 h, capped at ₦3,000 a day)');
    expect(
      priceLabel({
        product: 'DAILY',
        hourlyRateKobo: null,
        minMinutes: 60,
        dailyCapKobo: null,
        dailyRateKobo: 250_050,
        monthlyRateKobo: null,
      }),
    ).toBe('₦2,500.50 per day');
  });
});

describe('describeLotGaps', () => {
  it('turns LOT_INCOMPLETE into what to do', () => {
    const p = parseProblem(422, {
      code: 'LOT_INCOMPLETE',
      errors: [
        { path: 'PHOTOS', message: 'x' },
        { path: 'PAYOUT_ACCOUNT', message: 'x' },
      ],
    });
    expect(describeLotGaps(p)).toEqual([
      'At least 3 photos',
      'Your bank account for payouts (on the Verification page)',
    ]);
  });
});
