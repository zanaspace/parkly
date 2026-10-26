import { assertKobo, mulDivRoundHalfUp, type Kobo } from '../money/money.js';
import { ceil15Minutes, isSlotAligned, lagosDateKey, SLOT_MINUTES } from '../time/slots.js';

/**
 * Prices are computed only here, on the server (doc 00 §3.4, doc 02 §4).
 * Every amount is integer kobo; division rounds half up.
 */

export type Product = 'HOURLY' | 'DAILY' | 'MONTHLY';

/** The price columns of an ACTIVE rate plan (doc 02 §2.5). */
export type RatePlanPrices = {
  product: Product;
  hourlyRateKobo: number | null;
  minMinutes: number;
  dailyCapKobo: number | null;
  dailyRateKobo: number | null;
  monthlyRateKobo: number | null;
};

export type PricingSettings = {
  /** `fees.service_fee_kobo` */
  serviceFeeKobo: Kobo;
  /** `fees.service_fee_max_duration_min`: stays this long or longer pay no service fee. */
  serviceFeeMaxDurationMin: number;
  /** The operator's commission in basis points (taken on the parking price only). */
  commissionBps: number;
};

export type QuoteLine =
  | { kind: 'HOURLY_DAY'; date: string; minutes: number; amountKobo: Kobo; capped: boolean }
  | { kind: 'DAY'; date: string; amountKobo: Kobo }
  | { kind: 'MONTH'; periodStart: string; periodEnd: string; amountKobo: Kobo }
  | { kind: 'EXTENSION'; minutes: number; amountKobo: Kobo }
  | { kind: 'OVERSTAY'; minutes: number; amountKobo: Kobo }
  | { kind: 'SERVICE_FEE'; amountKobo: Kobo };

export type Quote = {
  product: Product;
  /** Parking price, which the operator is paid from. */
  priceKobo: Kobo;
  /** Parkly's fee to the driver. */
  serviceFeeKobo: Kobo;
  /** What the driver pays: price + service fee. */
  totalKobo: Kobo;
  /** Parkly's commission on the price. */
  commissionKobo: Kobo;
  operatorAmountKobo: Kobo;
  lines: QuoteLine[];
};

export type QuoteResult =
  { ok: true; quote: Quote } | { ok: false; code: 'PRICING_INVALID_DURATION' };

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Doc 02 §4: a monthly pass runs 30 days, period end = start + 29 days. */
const PASS_DAYS = 30;

const invalid = { ok: false, code: 'PRICING_INVALID_DURATION' } as const;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function required(value: number | null, name: string): Kobo {
  if (value === null) throw new RangeError(`Rate plan has no ${name}`);
  return assertKobo(value);
}

/** Splits the price into Parkly's commission and the operator's share. */
function settle(
  product: Product,
  priceKobo: Kobo,
  serviceFeeKobo: Kobo,
  commissionBps: number,
  lines: QuoteLine[],
): Quote {
  const commissionKobo = mulDivRoundHalfUp(priceKobo, commissionBps, 10_000);
  return {
    product,
    priceKobo,
    serviceFeeKobo,
    totalKobo: priceKobo + serviceFeeKobo,
    commissionKobo,
    operatorAmountKobo: priceKobo - commissionKobo,
    lines:
      serviceFeeKobo > 0 ? [...lines, { kind: 'SERVICE_FEE', amountKobo: serviceFeeKobo }] : lines,
  };
}

/** HOURLY: the minimum stay as one charge, then each 15-minute block; capped per Lagos day. */
function hourlyLines(plan: RatePlanPrices, startAt: Date, minutes: number): QuoteLine[] {
  const rate = required(plan.hourlyRateKobo, 'hourly rate');
  const blockKobo = mulDivRoundHalfUp(rate, SLOT_MINUTES, 60);
  const byDay = new Map<string, { minutes: number; amountKobo: number }>();
  const add = (at: Date, mins: number, amount: number) => {
    const key = lagosDateKey(at);
    const day = byDay.get(key) ?? { minutes: 0, amountKobo: 0 };
    day.minutes += mins;
    day.amountKobo += amount;
    byDay.set(key, day);
  };
  // The minimum charge belongs to the day the stay starts; its minutes to the days they fall in.
  byDay.set(lagosDateKey(startAt), {
    minutes: 0,
    amountKobo: mulDivRoundHalfUp(rate, plan.minMinutes, 60),
  });
  for (let m = 0; m < minutes; m += SLOT_MINUTES) {
    const blockStart = new Date(startAt.getTime() + m * MINUTE_MS);
    add(blockStart, SLOT_MINUTES, m < plan.minMinutes ? 0 : blockKobo);
  }
  return [...byDay].map(([date, day]) => {
    const capped = plan.dailyCapKobo !== null && day.amountKobo > plan.dailyCapKobo;
    return {
      kind: 'HOURLY_DAY' as const,
      date,
      minutes: day.minutes,
      amountKobo: capped ? (plan.dailyCapKobo as number) : day.amountKobo,
      capped,
    };
  });
}

/** DAILY: one daily rate for every Lagos calendar day the stay touches. */
function dailyLines(plan: RatePlanPrices, startAt: Date, endAt: Date): QuoteLine[] {
  const rate = required(plan.dailyRateKobo, 'daily rate');
  const lines: QuoteLine[] = [];
  const last = lagosDateKey(new Date(endAt.getTime() - 1));
  for (let d = lagosDateKey(startAt); d <= last; d = addDays(d, 1))
    lines.push({ kind: 'DAY', date: d, amountKobo: rate });
  return lines;
}

const sum = (lines: QuoteLine[]) => lines.reduce((total, l) => total + l.amountKobo, 0);

/**
 * Doc 02 §4. HOURLY and DAILY windows sit on the 15-minute grid; HOURLY stays
 * last at least the plan's minimum. MONTHLY runs 30 days from `startAt`
 * (`endAt` is ignored) and pays no service fee.
 */
export function quote(input: {
  ratePlan: RatePlanPrices;
  startAt: Date;
  endAt: Date;
  settings: PricingSettings;
}): QuoteResult {
  const { ratePlan: plan, startAt, endAt, settings } = input;
  if (plan.product === 'MONTHLY') {
    const rate = required(plan.monthlyRateKobo, 'monthly rate');
    const periodStart = lagosDateKey(startAt);
    const lines: QuoteLine[] = [
      {
        kind: 'MONTH',
        periodStart,
        periodEnd: addDays(periodStart, PASS_DAYS - 1),
        amountKobo: rate,
      },
    ];
    return { ok: true, quote: settle('MONTHLY', rate, 0, settings.commissionBps, lines) };
  }

  const minutes = (endAt.getTime() - startAt.getTime()) / MINUTE_MS;
  const is5Min = minutes === 5;
  if (!is5Min) {
    if (!isSlotAligned(startAt) || !isSlotAligned(endAt) || minutes <= 0) return invalid;
    if (plan.product === 'HOURLY' && minutes < plan.minMinutes) return invalid;
  } else {
    if (minutes <= 0) return invalid;
  }

  const lines =
    is5Min && plan.product === 'HOURLY'
      ? [
          {
            kind: 'HOURLY_DAY' as const,
            date: lagosDateKey(startAt),
            minutes: 5,
            amountKobo: mulDivRoundHalfUp(required(plan.hourlyRateKobo, 'hourly rate'), SLOT_MINUTES, 60),
            capped: false,
          },
        ]
      : plan.product === 'HOURLY'
        ? hourlyLines(plan, startAt, minutes)
        : dailyLines(plan, startAt, endAt);
  const fee = minutes < settings.serviceFeeMaxDurationMin ? settings.serviceFeeKobo : 0;
  return { ok: true, quote: settle(plan.product, sum(lines), fee, settings.commissionBps, lines) };
}

/**
 * Doc 02 §4 EXTENSION: the price of the whole new stay minus what was already
 * paid, so blocks and daily caps stay consistent. Never negative; no service fee.
 */
export function extensionQuote(input: {
  ratePlan: RatePlanPrices;
  startAt: Date;
  originalEndAt: Date;
  newEndAt: Date;
  paidPriceKobo: Kobo;
  settings: PricingSettings;
}): QuoteResult {
  if (input.newEndAt.getTime() <= input.originalEndAt.getTime()) return invalid;
  const whole = quote({
    ratePlan: input.ratePlan,
    startAt: input.startAt,
    endAt: input.newEndAt,
    settings: input.settings,
  });
  if (!whole.ok) return whole;
  const price = Math.max(0, whole.quote.priceKobo - input.paidPriceKobo);
  const minutes = (input.newEndAt.getTime() - input.originalEndAt.getTime()) / MINUTE_MS;
  return {
    ok: true,
    quote: settle(input.ratePlan.product, price, 0, input.settings.commissionBps, [
      { kind: 'EXTENSION', minutes, amountKobo: price },
    ]),
  };
}

/**
 * Doc 02 §4 OVERSTAY: minutes past `endAt + grace`, rounded up to 15-minute
 * blocks, at the hourly block price (or daily rate / 24 per hour when the lot
 * has no hourly price). No service fee.
 */
export function overstayCharge(input: {
  ratePlans: readonly RatePlanPrices[];
  endAt: Date;
  checkOutAt: Date;
  graceMin: number;
  commissionBps: number;
}): Quote {
  const hourly = input.ratePlans.find((p) => p.product === 'HOURLY' && p.hourlyRateKobo !== null);
  const daily = input.ratePlans.find((p) => p.product === 'DAILY' && p.dailyRateKobo !== null);
  let blockKobo: Kobo;
  if (hourly) blockKobo = mulDivRoundHalfUp(hourly.hourlyRateKobo as number, SLOT_MINUTES, 60);
  else if (daily)
    blockKobo = mulDivRoundHalfUp(daily.dailyRateKobo as number, SLOT_MINUTES, 24 * 60);
  else throw new RangeError('Overstay needs an hourly or daily price');

  const late = (input.checkOutAt.getTime() - input.endAt.getTime()) / MINUTE_MS - input.graceMin;
  const minutes = ceil15Minutes(late);
  const price = (minutes / SLOT_MINUTES) * blockKobo;
  return settle(hourly ? 'HOURLY' : 'DAILY', price, 0, input.commissionBps, [
    { kind: 'OVERSTAY', minutes, amountKobo: price },
  ]);
}
