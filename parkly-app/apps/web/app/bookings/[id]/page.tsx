import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeftIcon, ShieldCheckIcon } from '../../../components/icons';
import { QrCode } from '../../../components/qr-code';
import { StayTimer } from '../../../components/stay-timer';
import { apiAs, ApiProblem } from '../../../lib/api';
import { lineLabel } from '../../../lib/search';
import { requireDriver } from '../../../lib/session';
import { createClient } from '../../../lib/supabase/server';

export const metadata: Metadata = { title: 'Your booking · Parkly' };

/** D-17 on the web: the code for the gate, where and when, what was paid. */
export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = await requireDriver(`/bookings/${id}`);
  let booking: Booking;
  try {
    booking = await apiAs<Booking>(driver.accessToken, `/v1/bookings/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiProblem) {
      if (err.status === 404 || err.status === 400) notFound();
      if (err.status === 401 || err.status === 403) {
        const supabase = await createClient();
        await supabase.auth.signOut({ scope: 'local' });
        redirect(`/sign-in?next=${encodeURIComponent(`/bookings/${id}`)}`);
      }
    }
    throw err;
  }
  const confirmed = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';

  return (
    <main className="pk-page pk-stack" style={{ marginBlock: '1.5rem', maxWidth: '38rem' }}>
      <Link href="/bookings" className="pk-nav-pill" style={{ alignSelf: 'flex-start', paddingLeft: '0.6rem' }}>
        <ArrowLeftIcon size={16} />
        <span>Back to My Bookings</span>
      </Link>
      {booking.status === 'PENDING_PAYMENT' && <meta httpEquiv="refresh" content="3" />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span className="pk-badge pk-badge--brand-subtle">{statusLabel(booking.status)}</span>
        <span className="pk-badge pk-badge--verified">
          <ShieldCheckIcon size={12} />
          <span>LASPA Verified</span>
        </span>
      </div>
      <Text variant="heading-xl" as="h1" style={{ margin: '0.2rem 0' }}>
        {confirmed ? 'You’re booked' : 'Booking'}
      </Text>
      <StayTimer booking={booking} />
      {confirmed && !booking.stay?.checkedOutAt && (
        <section className="pk-card pk-stack pk-ticket" aria-label="Booking code">
          <Text tone="secondary">Show this at the gate</Text>
          {booking.qrToken && (
            <QrCode value={booking.qrToken} label={`QR ticket for booking ${booking.code}`} />
          )}
          <p className="pk-ticket__code">{booking.code}</p>
          <code>{booking.vehicle.plate}</code>
          {booking.overstay && (
            <Text variant="body-sm" tone="secondary">
              Overstay: {formatNaira(booking.overstay.per15Kobo)} per 15 min after{' '}
              {booking.overstay.graceMin} min grace
            </Text>
          )}
        </section>
      )}
      {booking.status === 'PENDING_PAYMENT' && (
        <p className="pk-notice pk-notice--info" role="status">
          We’re waiting for Paystack to confirm your payment. This page updates by itself.
        </p>
      )}
      <section className="pk-card pk-stack">
        <Text variant="heading-md" as="h2">
          {booking.lot.name}
        </Text>
        <Text tone="secondary">{booking.lot.addressLine}</Text>
        <Text>{bookingWindowLabel(booking)}</Text>
        <table className="pk-breakdown">
          <tbody>
            {booking.lines.map((l, i) => (
              <tr key={i}>
                <td>{lineLabel(l)}</td>
                <td>{formatNaira(l.amountKobo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{confirmed ? 'Paid' : 'Total'}</th>
              <td>{formatNaira(booking.totalKobo)}</td>
            </tr>
          </tfoot>
        </table>
        <Link className="pk-link" href={`/lots/${booking.lot.slug}`}>
          Car park details and directions
        </Link>
      </section>
      <Link className="pk-link" href="/bookings">
        All my bookings
      </Link>
    </main>
  );
}
