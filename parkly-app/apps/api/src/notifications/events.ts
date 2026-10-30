import type { BookingRow, Store } from '../store/types.js';

/** The fields every booking notification carries (doc 02 notification events). */
export type BookingNoticeBase = {
  driverId: string;
  bookingId: string;
  bookingCode: string;
  lotName: string;
};

/** The booking and its notice fields, or null if it no longer exists. */
export async function bookingNotice(
  store: Store,
  bookingOrId: BookingRow | string,
): Promise<{ booking: BookingRow; base: BookingNoticeBase } | null> {
  const booking =
    typeof bookingOrId === 'string' ? await store.bookings.find(bookingOrId) : bookingOrId;
  if (!booking) return null;
  const lot = await store.lots.findById(booking.lotId);
  return {
    booking,
    base: {
      driverId: booking.driverId,
      bookingId: booking.id,
      bookingCode: booking.code,
      lotName: lot?.name ?? 'the car park',
    },
  };
}
