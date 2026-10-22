import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { QrCode } from '../../../components/qr-code';
import { apiAs, ApiProblem } from '../../../lib/api';
import { lineLabel } from '../../../lib/search';
import { requireDriver } from '../../../lib/session';

export const metadata: Metadata = { title: 'Your booking · Parkly' };

/** D-17 on the web: the code for the gate, where and when, what was paid. */
export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = await requireDriver(`/bookings/${id}`);
  let booking: Booking;
  try {
    booking = await apiAs<Booking>(driver.accessToken, `/v1/bookings/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const confirmed = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';

  return (
    <main className="pk-page pk-stack">
      {booking.status === 'PENDING_PAYMENT' && <meta httpEquiv="refresh" content="3" />}
      <Text variant="overline" tone="brand">
        {statusLabel(booking.status)}
      </Text>
      <Text variant="heading-xl" as="h1">
        {confirmed ? 'You’re booked' : 'Booking'}
      </Text>
      {confirmed && (
        <section className="pk-card pk-stack pk-ticket" aria-label="Booking code">
          <Text tone="secondary">Show this at the gate</Text>
          {booking.qrToken && (
            <QrCode value={booking.qrToken} label={`QR ticket for booking ${booking.code}`} />
          )}
          <p className="pk-ticket__code">{booking.code}</p>
          <code>{booking.vehicle.plate}</code>
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
