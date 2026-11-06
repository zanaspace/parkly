import type { Booking } from '@parkly/contracts';

/**
 * Returns the dynamic label for the first filter tab in My Bookings.
 * - When a driver has checked in (currently parked): 'Active' (or 'Active & Upcoming' if mixed)
 * - When bookings are reserved / held but not checked in yet: 'Upcoming'
 * - Empty / default: 'Upcoming'
 */
export function upcomingTabLabel(bookings: Booking[] | null | undefined): string {
  if (!bookings || bookings.length === 0) return 'Upcoming';
  const hasActive = bookings.some(
    (b) => b.status === 'CHECKED_IN' || Boolean(b.stay?.checkedInAt && !b.stay?.checkedOutAt),
  );
  const hasUpcoming = bookings.some(
    (b) => (b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT') && !b.stay?.checkedInAt,
  );
  if (hasActive && hasUpcoming) return 'Active & Upcoming';
  if (hasActive) return 'Active';
  return 'Upcoming';
}
