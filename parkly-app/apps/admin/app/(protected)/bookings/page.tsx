import type { AdminBooking } from '@parkly/contracts';
import { formatKobo } from '../../../lib/lots/copy';
import { Button, Text } from '@parkly/ui';
import { WaiveOverstayForm } from '../../../components/waive-overstay';
import { apiFetch, ApiProblem } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { bookingCode, canWaive, overstayOwed } from '../../../lib/bookings/code';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Bookings · Parkly Admin' };

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

const OVERSTAY_TEXT: Record<NonNullable<AdminBooking['overstay']>['status'], string> = {
  NONE: 'None',
  DUE: 'Due (the driver has 24 hours)',
  UNPAID: 'Unpaid: blocking new bookings',
  PAID: 'Paid',
  WAIVED: 'Waived',
};

/** Support looks a booking up by code; ops can waive its overstay (FR-BOOK-008, gap review L-4). */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { me, accessToken } = await requireAccess();
  const typed = (await searchParams).code ?? '';
  const code = typed ? bookingCode(typed) : null;

  let booking: AdminBooking | null = null;
  let problem: string | null = typed && !code ? 'Booking codes look like PK-3MV7BU.' : null;
  if (code) {
    try {
      booking = await apiFetch<AdminBooking>(
        publicEnv().apiUrl,
        `/v1/admin/bookings/by-code/${encodeURIComponent(code)}`,
        accessToken,
      );
    } catch (err) {
      problem =
        err instanceof ApiProblem && err.status === 404
          ? `No booking ${code}.`
          : err instanceof ApiProblem && err.status === 403
            ? 'Your role can’t look up bookings.'
            : 'Something went wrong. Please try again.';
    }
  }

  return (
    <main className="pk-page pk-stack">
      <Text variant="heading-xl" as="h1">
        Bookings
      </Text>
      <Text tone="secondary">Find a booking by its code to see the stay and any overstay.</Text>
      <form className="pk-row" action="/bookings" method="get">
        <label className="pk-field" style={{ flex: 1 }}>
          <span className="pk-field__label">Booking code</span>
          <input className="pk-input" name="code" defaultValue={typed} placeholder="PK-3MV7BU" />
        </label>
        <Button type="submit">Find</Button>
      </form>

      {problem && (
        <p className="pk-notice pk-notice--error" role="alert">
          {problem}
        </p>
      )}

      {booking && (
        <section className="pk-card pk-stack" aria-label={`Booking ${booking.code}`}>
          <Text variant="heading-md" as="h2">
            {booking.code} · {booking.lotName}
          </Text>
          <Text tone="secondary">
            {lagosTime.format(new Date(booking.startAt))} to{' '}
            {lagosTime.format(new Date(booking.endAt))} · {booking.status.replace('_', ' ')}
          </Text>
          {booking.overstay && booking.overstay.amountKobo > 0 ? (
            <Text>
              Overstay: {booking.overstay.minutes} min, {formatKobo(booking.overstay.amountKobo)}.{' '}
              {OVERSTAY_TEXT[booking.overstay.status]}.
            </Text>
          ) : (
            <Text tone="secondary">No overstay.</Text>
          )}
          {overstayOwed(booking.overstay) && canWaive(me.roles) && (
            <WaiveOverstayForm
              bookingId={booking.id}
              amount={formatKobo(booking.overstay?.amountKobo ?? 0)}
            />
          )}
        </section>
      )}
    </main>
  );
}
