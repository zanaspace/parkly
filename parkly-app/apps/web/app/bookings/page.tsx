import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CarIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  SearchIcon,
  ShieldCheckIcon,
  TicketIcon,
} from '../../components/icons';
import { apiAs, ApiProblem } from '../../lib/api';
import { requireDriver } from '../../lib/session';
import { createClient } from '../../lib/supabase/server';

export const metadata: Metadata = { title: 'My bookings · Parkly' };

function statusBadgeClass(status: Booking['status']) {
  switch (status) {
    case 'CONFIRMED':
      return 'pk-badge pk-badge--confirmed';
    case 'CHECKED_IN':
      return 'pk-badge pk-badge--checkedin';
    case 'PENDING_PAYMENT':
      return 'pk-badge pk-badge--pending';
    case 'COMPLETED':
      return 'pk-badge pk-badge--completed';
    default:
      return 'pk-badge pk-badge--cancelled';
  }
}

/** FR-BOOK-004 on the web: upcoming first, then past. */
export default async function MyBookings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const tab = (await searchParams).status === 'past' ? 'past' : 'upcoming';
  const driver = await requireDriver(`/bookings?status=${tab}`);
  let items: Booking[];
  try {
    const res = await apiAs<{ items: Booking[] }>(
      driver.accessToken,
      `/v1/bookings?status=${tab}`,
    );
    items = res.items;
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 401 || err.status === 403)) {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: 'local' });
      redirect(`/sign-in?next=${encodeURIComponent(`/bookings?status=${tab}`)}`);
    }
    throw err;
  }

  return (
    <main className="pk-page pk-bookings-page">
      <div className="pk-bookings-header">
        <div className="pk-bookings-header-meta">
          <span className="pk-badge pk-badge--brand-subtle">Driver Reservations</span>
          <h1 className="pk-bookings-title">My Bookings</h1>
          <p className="pk-bookings-subtitle">
            Manage your active reservations, digital tickets, and parking history in Lagos.
          </p>
        </div>

        <nav className="pk-tabs-container" aria-label="Bookings filters">
          <Link
            className={`pk-tab-pill ${tab === 'upcoming' ? 'pk-tab-pill--active' : ''}`}
            href="/bookings"
            aria-current={tab === 'upcoming' ? 'page' : undefined}
          >
            <TicketIcon size={16} />
            <span>Upcoming</span>
          </Link>
          <Link
            className={`pk-tab-pill ${tab === 'past' ? 'pk-tab-pill--active' : ''}`}
            href="/bookings?status=past"
            aria-current={tab === 'past' ? 'page' : undefined}
          >
            <ClockIcon size={16} />
            <span>Past</span>
          </Link>
        </nav>
      </div>

      {items.length === 0 ? (
        <div className="pk-empty-state-card">
          <div className="pk-empty-icon-box">
            {tab === 'upcoming' ? <TicketIcon size={34} /> : <ClockIcon size={34} />}
          </div>
          <div className="pk-empty-content">
            <h2 className="pk-empty-title">
              {tab === 'upcoming' ? 'No active bookings yet' : 'No past bookings found'}
            </h2>
            <p className="pk-empty-description">
              {tab === 'upcoming'
                ? 'You don’t have any upcoming reservations right now. Search across Victoria Island, Lekki, Ikeja, and more to reserve verified parking upfront.'
                : 'You don’t have any completed or past parking sessions yet. Your past reservations, digital tickets, and gate receipts will be archived here.'}
            </p>
          </div>
          <Link href="/search" className="pk-btn-primary">
            <SearchIcon size={18} />
            <span>Find & Book Parking</span>
          </Link>
        </div>
      ) : (
        <div className="pk-bookings-grid">
          {items.map((b) => (
            <Link key={b.id} className="pk-booking-card" href={`/bookings/${b.id}`}>
              <div className="pk-booking-card-header">
                <div className="pk-booking-card-lot">
                  <span className="pk-booking-card-name">{b.lot.name}</span>
                  <span className="pk-badge pk-badge--verified" title="LASPA Permit Verified">
                    <ShieldCheckIcon size={12} />
                    <span>Verified</span>
                  </span>
                </div>
                <span className={statusBadgeClass(b.status)}>{statusLabel(b.status)}</span>
              </div>

              <div className="pk-booking-card-details">
                <div className="pk-booking-card-meta">
                  <ClockIcon size={15} />
                  <span>{bookingWindowLabel(b)}</span>
                </div>
                <div className="pk-booking-card-meta">
                  <CarIcon size={15} />
                  <span className="pk-plate-pill">{b.vehicle.plate}</span>
                </div>
                {b.lot.addressLine ? (
                  <div className="pk-booking-card-meta pk-booking-card-address">
                    <MapPinIcon size={15} />
                    <span>{b.lot.addressLine}</span>
                  </div>
                ) : null}
              </div>

              <div className="pk-booking-card-footer">
                <div className="pk-booking-card-code-wrap">
                  <span className="pk-booking-code-label">Gate Code</span>
                  <code className="pk-code-badge">{b.code}</code>
                </div>
                <div className="pk-booking-card-price-wrap">
                  <span className="pk-booking-price">{formatNaira(b.totalKobo)}</span>
                  <span className="pk-booking-card-arrow">
                    <span>View ticket</span>
                    <ChevronRightIcon size={16} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

