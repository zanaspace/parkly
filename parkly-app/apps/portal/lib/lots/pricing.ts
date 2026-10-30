import type { RatePlan, SetRatePlanRequest } from '@parkly/contracts';
import { formatNaira, nairaToKobo } from '@parkly/domain/money';
import type { ApiProblem } from '../api';

/** Typed naira ("₦1,500", "450.50") → kobo; null for anything that is not a positive amount. */
function koboFrom(input: FormDataEntryValue | null): number | null {
  const text = String(input ?? '').trim();
  if (!text) return null;
  try {
    const kobo = nairaToKobo(text);
    return kobo > 0 ? kobo : null;
  } catch {
    return null;
  }
}

/**
 * Reads one price form. Only turns what the operator typed into kobo; the
 * API validates the plan and prices are always computed server-side.
 */
export function readRatePlanForm(
  form: FormData,
): { ok: true; body: SetRatePlanRequest } | { ok: false; error: string } {
  const product = String(form.get('product') ?? '');
  const rate = koboFrom(form.get('rate'));
  if (rate === null) return { ok: false, error: 'Enter a price in naira, e.g. 500 or 1,500.' };
  if (product === 'HOURLY') {
    const capText = String(form.get('dailyCap') ?? '').trim();
    const cap = koboFrom(capText);
    if (capText && cap === null)
      return { ok: false, error: 'Enter the daily cap in naira, or leave it empty.' };
    // ADR 0016: optional; empty means hourly ÷ 4 and the platform's grace.
    const overstayText = String(form.get('overstayRate') ?? '').trim();
    const overstay = koboFrom(overstayText);
    if (overstayText && overstay === null)
      return { ok: false, error: 'Enter the overstay price in naira, or leave it empty.' };
    const grace = Number(form.get('overstayGrace') ?? '');
    return {
      ok: true,
      body: {
        product: 'HOURLY',
        hourlyRateKobo: rate,
        minMinutes: Number(form.get('minMinutes') ?? 60),
        ...(cap !== null ? { dailyCapKobo: cap } : {}),
        ...(overstay !== null ? { overstayRateKobo: overstay } : {}),
        ...(grace > 0 ? { overstayGraceMin: grace } : {}),
      },
    };
  }
  if (product === 'DAILY') return { ok: true, body: { product: 'DAILY', dailyRateKobo: rate } };
  if (product === 'MONTHLY')
    return { ok: true, body: { product: 'MONTHLY', monthlyRateKobo: rate } };
  return { ok: false, error: 'Choose hourly, daily or monthly.' };
}

const hours = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

export function priceLabel(
  p: Pick<
    RatePlan,
    | 'product'
    | 'hourlyRateKobo'
    | 'minMinutes'
    | 'dailyCapKobo'
    | 'dailyRateKobo'
    | 'monthlyRateKobo'
  >,
): string {
  if (p.product === 'HOURLY' && p.hourlyRateKobo !== null) {
    const cap = p.dailyCapKobo !== null ? `, capped at ${formatNaira(p.dailyCapKobo)} a day` : '';
    return `${formatNaira(p.hourlyRateKobo)} per hour (minimum ${hours(p.minMinutes)}${cap})`;
  }
  if (p.product === 'DAILY' && p.dailyRateKobo !== null)
    return `${formatNaira(p.dailyRateKobo)} per day`;
  if (p.product === 'MONTHLY' && p.monthlyRateKobo !== null)
    return `${formatNaira(p.monthlyRateKobo)} per calendar month`;
  return 'Price not set';
}

const GAPS: Record<string, string> = {
  PROFILE: 'Lot details',
  PHOTOS: 'At least 3 photos',
  OPENING_HOURS: 'Opening hours',
  RATE_PLAN: 'At least one price (hourly, daily or monthly)',
  PERMIT: 'A valid LASPA permit with its scan',
  PAYOUT_ACCOUNT: 'Your bank account for payouts (on the Verification page)',
};

export function describeLotGaps(problem: ApiProblem): string[] {
  return (problem.errors ?? []).map((e) => GAPS[e.path] ?? e.path);
}
