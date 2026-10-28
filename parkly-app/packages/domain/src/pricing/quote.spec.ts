import { describe, expect, it } from 'vitest';
import {
  extensionQuote,
  overstayCharge,
  quote,
  type PricingSettings,
  type RatePlanPrices,
} from './quote.js';

// Doc 02 §4 worked examples: ₦1,000/h, 15-min blocks, 60-min minimum, ₦100 fee, 1200 bps.
const settings: PricingSettings = {
  serviceFeeKobo: 10_000,
  serviceFeeMaxDurationMin: 1440,
  commissionBps: 1200,
};
const hourly = (hourlyRateKobo: number, extra: Partial<RatePlanPrices> = {}): RatePlanPrices => ({
  product: 'HOURLY',
  hourlyRateKobo,
  minMinutes: 60,
  dailyCapKobo: null,
  dailyRateKobo: null,
  monthlyRateKobo: null,
  ...extra,
});
const daily = (dailyRateKobo: number): RatePlanPrices => ({
  product: 'DAILY',
  hourlyRateKobo: null,
  minMinutes: 60,
  dailyCapKobo: null,
  dailyRateKobo,
  monthlyRateKobo: null,
});
const monthly = (monthlyRateKobo: number): RatePlanPrices => ({
  product: 'MONTHLY',
  hourlyRateKobo: null,
  minMinutes: 60,
  dailyCapKobo: null,
  dailyRateKobo: null,
  monthlyRateKobo,
});

/** Lagos is UTC+1: '2026-10-20 08:00' Lagos = 07:00Z. */
const lagos = (local: string) => new Date(`${local.replace(' ', 'T')}:00+01:00`);
const at = (start: string, minutes: number) => ({
  startAt: lagos(start),
  endAt: new Date(lagos(start).getTime() + minutes * 60_000),
});

function ok(result: ReturnType<typeof quote>) {
  if (!result.ok) throw new Error(`expected a quote, got ${result.code}`);
  return result.quote;
}
const amounts = (q: ReturnType<typeof ok>) => [
  q.priceKobo,
  q.serviceFeeKobo,
  q.totalKobo,
  q.commissionKobo,
  q.operatorAmountKobo,
];

describe('quote: doc 02 §4 worked examples (mandatory)', () => {
  it('#1 one hour', () => {
    const q = ok(quote({ ratePlan: hourly(100_000), ...at('2026-10-20 08:00', 60), settings }));
    expect(amounts(q)).toEqual([100_000, 10_000, 110_000, 12_000, 88_000]);
  });

  it('#2 2 h 15 m = first hour + 5 blocks', () => {
    const q = ok(quote({ ratePlan: hourly(100_000), ...at('2026-10-20 08:00', 135), settings }));
    expect(amounts(q)).toEqual([225_000, 10_000, 235_000, 27_000, 198_000]);
  });

  it('#3 10 h with a ₦6,000 daily cap', () => {
    const q = ok(
      quote({
        ratePlan: hourly(100_000, { dailyCapKobo: 600_000 }),
        ...at('2026-10-20 08:00', 600),
        settings,
      }),
    );
    expect(amounts(q)).toEqual([600_000, 10_000, 610_000, 72_000, 528_000]);
    expect(q.lines[0]).toMatchObject({ kind: 'HOURLY_DAY', date: '2026-10-20', capped: true });
  });

  it('#4 ₦750/h for 1 h 15 m', () => {
    const q = ok(quote({ ratePlan: hourly(75_000), ...at('2026-10-20 08:00', 75), settings }));
    expect(amounts(q)).toEqual([93_750, 10_000, 103_750, 11_250, 82_500]);
  });

  it('#5 extending #2 to 3 h charges the difference, no fee', () => {
    const plan = hourly(100_000);
    const original = at('2026-10-20 08:00', 135);
    const ext = extensionQuote({
      ratePlan: plan,
      startAt: original.startAt,
      originalEndAt: original.endAt,
      newEndAt: new Date(original.startAt.getTime() + 180 * 60_000),
      paidPriceKobo: 225_000,
      settings,
    });
    if (!ext.ok) throw new Error(ext.code);
    expect(amounts(ext.quote)).toEqual([75_000, 0, 75_000, 9_000, 66_000]);
  });

  it('#6 overstay 22 min with 10 min grace = one block', () => {
    const endAt = lagos('2026-10-20 10:00');
    const q = overstayCharge({
      ratePlans: [hourly(100_000)],
      endAt,
      checkOutAt: new Date(endAt.getTime() + 22 * 60_000),
      graceMin: 10,
      commissionBps: 1200,
    });
    expect(amounts(q)).toEqual([25_000, 0, 25_000, 3_000, 22_000]);
  });

  it('#7 monthly ₦45,000 flat, no fee', () => {
    const q = ok(quote({ ratePlan: monthly(4_500_000), ...at('2026-11-01 00:00', 0), settings }));
    expect(amounts(q)).toEqual([4_500_000, 0, 4_500_000, 540_000, 3_960_000]);
  });

  it('#8 ₦333/h, 1 h 15 m, 1250 bps rounds half up', () => {
    const q = ok(
      quote({
        ratePlan: hourly(33_300),
        ...at('2026-10-20 08:00', 75),
        settings: { ...settings, commissionBps: 1250 },
      }),
    );
    expect(amounts(q)).toEqual([41_625, 10_000, 51_625, 5_203, 36_422]);
  });
});

describe('quote: hourly', () => {
  const plan = hourly(100_000);
  const price = (start: string, minutes: number, p = plan) =>
    ok(quote({ ratePlan: p, ...at(start, minutes), settings })).priceKobo;

  it.each([
    [60, 100_000],
    [75, 125_000],
    [90, 150_000],
    [120, 200_000],
    [24 * 60 - 15, 100_000 + 91 * 25_000],
  ])('%i minutes cost %i kobo', (minutes, expected) => {
    expect(price('2026-10-20 08:00', minutes)).toBe(expected);
  });

  it('charges the minimum stay as one amount, then 15-minute blocks', () => {
    const twoHourMin = hourly(100_000, { minMinutes: 120 });
    expect(price('2026-10-20 08:00', 120, twoHourMin)).toBe(200_000);
    expect(price('2026-10-20 08:00', 135, twoHourMin)).toBe(225_000);
    const halfHourMin = hourly(100_000, { minMinutes: 30 });
    expect(price('2026-10-20 08:00', 30, halfHourMin)).toBe(50_000);
    expect(price('2026-10-20 08:00', 45, halfHourMin)).toBe(75_000);
  });

  it('refuses a 5-minute stay unless test stays are switched on', () => {
    expect(quote({ ratePlan: plan, ...at('2026-10-20 08:00', 5), settings }).ok).toBe(false);
  });

  it('quotes 5-minute test stay at the single 15-minute slot rate', () => {
    const r = quote({
      ratePlan: plan,
      ...at('2026-10-20 08:00', 5),
      settings,
      allowTestStays: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.quote.priceKobo).toBe(25_000);
      expect(r.quote.lines).toEqual([
        {
          kind: 'HOURLY_DAY',
          date: '2026-10-20',
          minutes: 5,
          amountKobo: 25_000,
          capped: false,
        },
        {
          kind: 'SERVICE_FEE',
          amountKobo: 10_000,
        },
      ]);
    }
  });

  it('refuses stays shorter than the minimum or off the 15-minute grid', () => {
    for (const minutes of [0, 15, 45, 61, 70]) {
      const r = quote({ ratePlan: plan, ...at('2026-10-20 08:00', minutes), settings });
      expect(r, String(minutes)).toEqual({ ok: false, code: 'PRICING_INVALID_DURATION' });
    }
    const offGrid = quote({
      ratePlan: plan,
      startAt: lagos('2026-10-20 08:05'),
      endAt: lagos('2026-10-20 09:05'),
      settings,
    });
    expect(offGrid).toEqual({ ok: false, code: 'PRICING_INVALID_DURATION' });
    const backwards = quote({
      ratePlan: plan,
      startAt: lagos('2026-10-20 09:00'),
      endAt: lagos('2026-10-20 08:00'),
      settings,
    });
    expect(backwards).toEqual({ ok: false, code: 'PRICING_INVALID_DURATION' });
  });

  it('applies the daily cap per Lagos calendar day across midnight', () => {
    const capped = hourly(100_000, { dailyCapKobo: 600_000 });
    // 20:00 → 08:00 next day: 4 h before midnight (₦4,000), 8 h after (₦8,000 → cap ₦6,000).
    const q = ok(quote({ ratePlan: capped, ...at('2026-10-20 20:00', 12 * 60), settings }));
    expect(q.priceKobo).toBe(400_000 + 600_000);
    expect(q.lines.filter((l) => l.kind === 'HOURLY_DAY')).toEqual([
      { kind: 'HOURLY_DAY', date: '2026-10-20', minutes: 240, amountKobo: 400_000, capped: false },
      { kind: 'HOURLY_DAY', date: '2026-10-21', minutes: 480, amountKobo: 600_000, capped: true },
    ]);
  });

  it('uses Lagos midnight, not UTC midnight', () => {
    const capped = hourly(100_000, { dailyCapKobo: 300_000 });
    // 23:00–01:00 Lagos is 22:00–00:00 UTC: two Lagos days, one UTC day.
    const q = ok(quote({ ratePlan: capped, ...at('2026-10-20 23:00', 120), settings }));
    expect(q.lines.filter((l) => l.kind === 'HOURLY_DAY').map((l) => l.date)).toEqual([
      '2026-10-20',
      '2026-10-21',
    ]);
    expect(q.priceKobo).toBe(200_000);
  });

  it('caps a full multi-day stay each day', () => {
    const capped = hourly(100_000, { dailyCapKobo: 600_000 });
    const q = ok(quote({ ratePlan: capped, ...at('2026-10-20 00:00', 3 * 24 * 60), settings }));
    expect(q.priceKobo).toBe(3 * 600_000);
    expect(q.serviceFeeKobo).toBe(0);
  });

  it('charges the service fee only below 24 hours', () => {
    expect(
      ok(quote({ ratePlan: plan, ...at('2026-10-20 08:00', 1425), settings })).serviceFeeKobo,
    ).toBe(10_000);
    expect(
      ok(quote({ ratePlan: plan, ...at('2026-10-20 08:00', 1440), settings })).serviceFeeKobo,
    ).toBe(0);
  });

  it('takes commission on the parking price only, never the fee', () => {
    const q = ok(quote({ ratePlan: plan, ...at('2026-10-20 08:00', 60), settings }));
    expect(q.commissionKobo + q.operatorAmountKobo).toBe(q.priceKobo);
    expect(q.totalKobo).toBe(q.priceKobo + q.serviceFeeKobo);
    expect(q.lines.at(-1)).toEqual({ kind: 'SERVICE_FEE', amountKobo: 10_000 });
  });

  it('rounds each block half up', () => {
    // ₦1,001/h → block 25,025; ₦1,002/h → 25,050; ₦999.98/h (99,998) → 24,999.5 → 25,000.
    expect(price('2026-10-20 08:00', 75, hourly(100_100))).toBe(100_100 + 25_025);
    expect(price('2026-10-20 08:00', 75, hourly(99_998))).toBe(99_998 + 25_000);
  });
});

describe('quote: daily and monthly', () => {
  it('charges a daily rate per Lagos calendar day touched', () => {
    const plan = daily(300_000);
    const p = (start: string, minutes: number) =>
      ok(quote({ ratePlan: plan, ...at(start, minutes), settings }));
    expect(p('2026-10-20 08:00', 600).priceKobo).toBe(300_000);
    expect(p('2026-10-20 08:00', 600).serviceFeeKobo).toBe(10_000);
    expect(p('2026-10-20 20:00', 12 * 60).priceKobo).toBe(600_000);
    expect(p('2026-10-20 00:00', 24 * 60).priceKobo).toBe(300_000);
    expect(p('2026-10-20 00:00', 24 * 60).serviceFeeKobo).toBe(0);
    expect(p('2026-10-20 23:45', 15).lines[0]).toEqual({
      kind: 'DAY',
      date: '2026-10-20',
      amountKobo: 300_000,
    });
  });

  it('refuses an empty or off-grid daily window', () => {
    const r = quote({ ratePlan: daily(300_000), ...at('2026-10-20 08:00', 0), settings });
    expect(r).toEqual({ ok: false, code: 'PRICING_INVALID_DURATION' });
  });

  it('runs a monthly pass 30 days from the start date', () => {
    const q = ok(quote({ ratePlan: monthly(4_500_000), ...at('2026-10-20 08:00', 0), settings }));
    expect(q.lines[0]).toEqual({
      kind: 'MONTH',
      periodStart: '2026-10-20',
      periodEnd: '2026-11-18',
      amountKobo: 4_500_000,
    });
  });

  it('refuses a plan without its price', () => {
    const broken = { ...daily(300_000), dailyRateKobo: null };
    expect(() => quote({ ratePlan: broken, ...at('2026-10-20 08:00', 60), settings })).toThrow(
      RangeError,
    );
  });
});

describe('extensions and overstay (doc 02 §4)', () => {
  const plan = hourly(100_000, { dailyCapKobo: 600_000 });
  const start = lagos('2026-10-20 08:00');
  const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

  it('keeps the daily cap consistent: extending into the cap can cost nothing more', () => {
    const ext = extensionQuote({
      ratePlan: plan,
      startAt: start,
      originalEndAt: after(600),
      newEndAt: after(660),
      paidPriceKobo: 600_000,
      settings,
    });
    expect(ext.ok && ext.quote.priceKobo).toBe(0);
  });

  it('refuses an extension that does not move the end later', () => {
    const ext = extensionQuote({
      ratePlan: plan,
      startAt: start,
      originalEndAt: after(120),
      newEndAt: after(120),
      paidPriceKobo: 200_000,
      settings,
    });
    expect(ext).toEqual({ ok: false, code: 'PRICING_INVALID_DURATION' });
  });

  it('charges nothing inside the grace period, then whole blocks', () => {
    const endAt = after(120);
    const charge = (minutesLate: number) =>
      overstayCharge({
        ratePlans: [hourly(100_000)],
        endAt,
        checkOutAt: new Date(endAt.getTime() + minutesLate * 60_000),
        graceMin: 10,
        commissionBps: 1200,
      }).priceKobo;
    expect(charge(-5)).toBe(0);
    expect(charge(10)).toBe(0);
    expect(charge(11)).toBe(25_000);
    expect(charge(26)).toBe(50_000);
  });

  it('falls back to the daily rate / 24 per hour when the lot has no hourly price', () => {
    const endAt = after(120);
    const q = overstayCharge({
      ratePlans: [daily(240_000)],
      endAt,
      checkOutAt: new Date(endAt.getTime() + 25 * 60_000),
      graceMin: 10,
      commissionBps: 1200,
    });
    // ₦2,400/day → ₦100/h → ₦25 a block; 15 late minutes = 1 block.
    expect(q.priceKobo).toBe(2_500);
  });

  it('throws when the lot has neither an hourly nor a daily price', () => {
    expect(() =>
      overstayCharge({
        ratePlans: [monthly(4_500_000)],
        endAt: start,
        checkOutAt: after(60),
        graceMin: 10,
        commissionBps: 1200,
      }),
    ).toThrow(RangeError);
  });
});
