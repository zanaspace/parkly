import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiAs } from '../../lib/api';
import { signOut } from '../../lib/auth/actions';
import { requireDriver } from '../../lib/session';

export const metadata: Metadata = { title: 'My bookings · Parkly' };

/** FR-BOOK-004 on the web: upcoming first, then past. */
export default async function MyBookings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const tab = (await searchParams).status === 'past' ? 'past' : 'upcoming';
  const driver = await requireDriver(`/bookings?status=${tab}`);
  const { items } = await apiAs<{ items: Booking[] }>(
    driver.accessToken,
    `/v1/bookings?status=${tab}`,
  );

  return (
    <main className="pk-page pk-stack">
      <Text variant="heading-xl" as="h1">
        My bookings
      </Text>
      <nav className="pk-row" aria-label="Bookings">
        <Link
          className="pk-link"
          href="/bookings"
          aria-current={tab === 'upcoming' ? 'page' : undefined}
        >
          Upcoming
        </Link>
        <Link
          className="pk-link"
          href="/bookings?status=past"
          aria-current={tab === 'past' ? 'page' : undefined}
        >
          Past
        </Link>
      </nav>
      {items.length === 0 && (
        <Text tone="secondary">
          {tab === 'upcoming' ? 'No upcoming bookings yet.' : 'Nothing here yet.'}
        </Text>
      )}
      <ul className="pk-list">
        {items.map((b) => (
          <li key={b.id}>
            <Link className="pk-card pk-booking-row" href={`/bookings/${b.id}`}>
              <span>
                <strong>{b.lot.name}</strong>
                <br />
                {bookingWindowLabel(b)}
                <br />
                <span className="pk-hint">
                  {statusLabel(b.status)} · {b.vehicle.plate}
                </span>
              </span>
              <span>
                <code>{b.code}</code>
                <br />
                {formatNaira(b.totalKobo)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="pk-link" href="/search">
        Find parking
      </Link>
      <form action={signOut}>
        <button type="submit" className="pk-link pk-link--button">
          Sign out
        </button>
      </form>
    </main>
  );
}
