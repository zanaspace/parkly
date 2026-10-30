import { calculateOverstay } from '@parkly/domain/booking';
import type { BookingRow, RatePlanRow, Store } from '../../store/types.js';

export type OverstayPricer = {
  /** The grace and price per 15 minutes this booking was sold with; null without a time-based price. */
  terms(booking: BookingRow): Promise<{ graceMin: number; per15Kobo: number } | null>;
  /** The overstay for leaving at `checkOutAt`; zero within the grace. */
  price(booking: BookingRow, checkOutAt: Date): Promise<{ minutes: number; kobo: number } | null>;
};

/**
 * Overstay is priced from the booking's own rate plan (gap review L-3): its
 * operator overstay price and grace (ADR 0016), never the lot's current price.
 * One pricer serves the booking view and check-out, so drivers see what
 * they are charged.
 */
export function overstayPricer(store: Store): OverstayPricer {
  const plans = new Map<string, Promise<RatePlanRow | null>>();
  let platformGrace: Promise<number> | null = null;
  const planOf = (id: string) => {
    let p = plans.get(id);
    if (!p) {
      p = store.ratePlans.find(id);
      plans.set(id, p);
    }
    return p;
  };
  const graceOf = () =>
    (platformGrace ??= store.settings
      .get<number>('session.overstay_grace_min')
      .then((v) => v ?? 10));

  const calc = async (booking: BookingRow, checkOutAt: Date) => {
    const plan = await planOf(booking.ratePlanId);
    if (!plan) return null;
    const result = calculateOverstay({
      endAt: booking.endAt,
      checkOutAt,
      ratePlan: plan,
      settings: { defaultGraceMin: await graceOf(), commissionBps: booking.commissionBps },
    });
    // A monthly plan has no time-based price to charge by.
    return result.per15Kobo > 0 ? result : null;
  };

  return {
    async terms(booking) {
      const plan = await planOf(booking.ratePlanId);
      const platform = await graceOf();
      const graceMin = Math.max(platform, plan?.overstayGraceMin ?? platform);
      const r = await calc(booking, new Date(booking.endAt.getTime() + (graceMin + 1) * 60_000));
      return r ? { graceMin, per15Kobo: r.per15Kobo } : null;
    },
    async price(booking, checkOutAt) {
      const r = await calc(booking, checkOutAt);
      return r ? { minutes: r.overstayMinutes, kobo: r.amountKobo } : null;
    },
  };
}
