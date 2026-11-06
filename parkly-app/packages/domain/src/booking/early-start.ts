import { mulDivRoundHalfUp, type Kobo } from '../money/money.js';
import { quote, type RatePlanPrices } from '../pricing/quote.js';
import { floorToSlot } from '../time/slots.js';
import type { BookingStatus } from './booking.js';

const MIN = 60_000;

/**
 * ADR 0023 stage 2: the start an early driver can buy, chosen so check-in
 * opens now and the free early-arrival minutes still count. Null when
 * check-in is already open (nothing to buy).
 */
export function earlyStartFor(input: {
  now: Date;
  startAt: Date;
  earlyArrivalMin: number;
}): { newStartAt: Date; addedMinutes: number } | null {
  const newStartAt = floorToSlot(new Date(input.now.getTime() + input.earlyArrivalMin * MIN));
  if (newStartAt.getTime() >= input.startAt.getTime()) return null;
  return {
    newStartAt,
    addedMinutes: Math.round((input.startAt.getTime() - newStartAt.getTime()) / MIN),
  };
}

/**
 * The early start's price, from the booking's own plan: the whole stay from
 * the new start, less what was paid (as extensions, so minimums and daily caps
 * hold and a later price cut can't make it negative). No service fee.
 */
export function calculateEarlyStartQuote(input: {
  ratePlan: RatePlanPrices;
  commissionBps: number;
  newStartAt: Date;
  endAt: Date;
  currentPriceKobo: Kobo;
}): { priceKobo: Kobo; commissionKobo: Kobo; operatorAmountKobo: Kobo } {
  const res = quote({
    ratePlan: input.ratePlan,
    startAt: input.newStartAt,
    endAt: input.endAt,
    settings: {
      serviceFeeKobo: 0 as Kobo,
      serviceFeeMaxDurationMin: 0,
      commissionBps: input.commissionBps,
    },
  });
  if (!res.ok) throw new Error(`Failed to price early start: ${res.code}`);
  const priceKobo = Math.max(0, res.quote.priceKobo - input.currentPriceKobo) as Kobo;
  const commissionKobo = mulDivRoundHalfUp(priceKobo, input.commissionBps, 10_000) as Kobo;
  return {
    priceKobo,
    commissionKobo,
    operatorAmountKobo: (priceKobo - commissionKobo) as Kobo,
  };
}

/**
 * Whether a paid extension or early start can still be applied to its booking
 * (the same rule as fn_confirm_extension). An extension meets the booking's
 * end while it is confirmed or parked; an early start meets its start, only
 * before the car is in. Otherwise the payment is refunded.
 */
export function extensionApplies(
  ext: { kind: 'EXTEND' | 'EARLY_START'; startAt: Date; newEndAt: Date },
  booking: { status: BookingStatus; startAt: Date; endAt: Date },
): boolean {
  if (ext.kind === 'EARLY_START')
    return booking.status === 'CONFIRMED' && ext.newEndAt.getTime() === booking.startAt.getTime();
  return (
    (booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN') &&
    ext.startAt.getTime() === booking.endAt.getTime()
  );
}
