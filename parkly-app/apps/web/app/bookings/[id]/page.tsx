import type { Booking } from '@parkly/contracts';
import { bookingWindowLabel, statusLabel } from '@parkly/domain/booking';
import { formatNaira } from '@parkly/domain/money';
import { PriceBreakdown, StatusBadge, Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CarIcon,
  ClockIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  MapPinIcon,
  SearchIcon,
  ShieldCheckIcon,
  TicketIcon,
} from '../../../components/icons';
import { BookingLifecycleActions } from '../../../components/booking-lifecycle';
import { QrCode } from '../../../components/qr-code';
import { SelfCheckinAction } from '../../../components/self-checkin';
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
  const isPaid =
    booking.status === 'CONFIRMED' ||
    booking.status === 'CHECKED_IN' ||
    booking.status === 'COMPLETED';
  const expiredOrCancelled =
    booking.status === 'EXPIRED' ||
    booking.status === 'CANCELLED' ||
    booking.status === 'NO_SHOW';

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${booking.lot.name}, ${booking.lot.addressLine}`,
  )}`;

  return (
    <main className="pk-page pk-booking-detail-page">
      {booking.status === 'PENDING_PAYMENT' && <meta httpEquiv="refresh" content="3" />}

      {/* Top Navigation & Reference Bar */}
      <div className="pk-booking-detail-topbar">
        <Link href="/bookings" className="pk-nav-pill" style={{ paddingLeft: '0.65rem' }}>
          <ArrowLeftIcon size={16} />
          <span>Back to My Bookings</span>
        </Link>
        <span className="pk-ref-code">PASS #{booking.code}</span>
      </div>

      {/* Status & Title Header */}
      <div className="pk-booking-detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <StatusBadge status={booking.status} label={statusLabel(booking.status)} />
          <span className="pk-badge pk-badge--verified">
            <ShieldCheckIcon size={12} />
            <span>LASPA Verified</span>
          </span>
        </div>

        <Text variant="heading-xl" as="h1" className="pk-booking-detail-title">
          {confirmed
            ? `You’re booked at ${booking.lot.name}`
            : booking.status === 'EXPIRED'
              ? `Reservation expired · ${booking.lot.name}`
              : booking.status === 'CANCELLED'
                ? `Reservation cancelled · ${booking.lot.name}`
                : booking.status === 'COMPLETED'
                  ? `Completed stay · ${booking.lot.name}`
                  : `Waiting for payment · ${booking.lot.name}`}
        </Text>

        <p className="pk-booking-detail-sub">
          {bookingWindowLabel(booking)} · {booking.lot.addressLine}
        </p>
      </div>

      {/* Status Alert Banners */}
      {expiredOrCancelled && (
        <div className="pk-status-banner pk-status-banner--warning" role="status">
          <div className="pk-status-banner-icon">
            <AlertCircleIcon size={24} />
          </div>
          <div className="pk-status-banner-body">
            <h2 className="pk-status-banner-title">
              {booking.status === 'EXPIRED'
                ? 'Reservation expired (not paid in time)'
                : booking.status === 'NO_SHOW'
                  ? 'Missed reservation'
                  : 'Reservation cancelled'}
            </h2>
            <p className="pk-status-banner-text">
              {booking.status === 'EXPIRED'
                ? 'This space hold was automatically released because payment was not completed within the reservation window. No funds were charged to your account.'
                : 'This reservation is no longer active. If you need parking in Lagos, check real-time availability below.'}
            </p>
            <div className="pk-status-banner-actions">
              <Link href={`/lots/${booking.lot.slug}`} className="pk-btn-primary pk-btn-sm">
                <span>Book again at this car park</span>
              </Link>
              <Link href="/search" className="pk-btn-secondary pk-btn-sm">
                <SearchIcon size={14} />
                <span>Search other car parks</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {booking.status === 'PENDING_PAYMENT' && (
        <div className="pk-status-banner pk-status-banner--info" role="status">
          <div className="pk-spinner" />
          <div className="pk-status-banner-body">
            <h2 className="pk-status-banner-title">Confirming payment with Paystack</h2>
            <p className="pk-status-banner-text">
              We are waiting for Paystack to complete your transaction. This page automatically updates every 3 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Official Gate Pass (Confirmed & Checked In) */}
      {confirmed && !booking.stay?.checkedOutAt && (
        <section className="pk-ticket-pass" aria-label="Digital gate ticket">
          <div className="pk-ticket-pass-header">
            <div className="pk-row" style={{ gap: '0.5rem' }}>
              <TicketIcon size={18} />
              <span className="pk-ticket-pass-title">Official Parkly Gate Pass</span>
            </div>
            <span className="pk-ticket-pass-subtitle">Show to attendant or scan at barrier</span>
          </div>

          <div className="pk-ticket-pass-body">
            {booking.qrToken && (
              <div className="pk-ticket-pass-qr">
                <div className="pk-qr-container">
                  <QrCode value={booking.qrToken} label={`QR ticket for booking ${booking.code}`} />
                </div>
                <span className="pk-ticket-pass-scan-hint">Scan at barrier reader</span>
              </div>
            )}

            <div className="pk-ticket-pass-details">
              <div className="pk-ticket-code-block">
                <span className="pk-ticket-code-label">Gate Pass Code</span>
                <span className="pk-ticket-code-value">{booking.code}</span>
              </div>

              <div className="pk-ticket-info-grid">
                <div>
                  <span className="pk-ticket-info-label">Vehicle Plate</span>
                  <span className="pk-plate-pill pk-plate-pill--lg">{booking.vehicle.plate}</span>
                </div>
                <div>
                  <span className="pk-ticket-info-label">Parking Facility</span>
                  <span className="pk-ticket-lot-name">{booking.lot.name}</span>
                </div>
              </div>

              {booking.overstay && (
                <div className="pk-ticket-overstay-note">
                  <ClockIcon size={14} />
                  <span>
                    Overstay rate: {formatNaira(booking.overstay.per15Kobo)} per 15 min (after{' '}
                    {booking.overstay.graceMin} min grace)
                  </span>
                </div>
              )}
            </div>
          </div>

          <SelfCheckinAction booking={booking} />
          <StayTimer booking={booking} />
          <BookingLifecycleActions booking={booking} />
        </section>
      )}

      {!confirmed && <BookingLifecycleActions booking={booking} />}

      {/* Structured 2-Column Responsive Detail Grid */}
      <div className="pk-booking-detail-grid">
        {/* Left Column: Facility & Reservation Details */}
        <section className="pk-detail-card" aria-label="Facility details">
          <div className="pk-detail-card-header">
            <h2 className="pk-detail-card-title">Facility & Access</h2>
            <span className="pk-badge pk-badge--brand-subtle">Verified Location</span>
          </div>

          <div className="pk-detail-rows">
            <div className="pk-detail-item">
              <div className="pk-detail-item-icon">
                <MapPinIcon size={18} />
              </div>
              <div className="pk-detail-item-content">
                <strong className="pk-detail-item-title">{booking.lot.name}</strong>
                <p className="pk-detail-item-desc">{booking.lot.addressLine}</p>
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pk-btn-secondary pk-btn-sm"
                  style={{ marginTop: '0.5rem', width: 'fit-content' }}
                >
                  <ExternalLinkIcon size={14} />
                  <span>Get Directions on Google Maps</span>
                </a>
              </div>
            </div>

            <div className="pk-detail-item">
              <div className="pk-detail-item-icon">
                <CalendarIcon size={18} />
              </div>
              <div className="pk-detail-item-content">
                <strong className="pk-detail-item-title">Reservation Window</strong>
                <p className="pk-detail-item-desc">{bookingWindowLabel(booking)}</p>
              </div>
            </div>

            <div className="pk-detail-item">
              <div className="pk-detail-item-icon">
                <CarIcon size={18} />
              </div>
              <div className="pk-detail-item-content">
                <strong className="pk-detail-item-title">Registered Vehicle</strong>
                <div style={{ marginTop: '0.25rem' }}>
                  <span className="pk-plate-pill">{booking.vehicle.plate}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pk-detail-card-footer">
            <Link href={`/lots/${booking.lot.slug}`} className="pk-link" style={{ fontSize: '0.875rem' }}>
              View full car park rules, hours & amenities →
            </Link>
          </div>
        </section>

        {/* Right Column: Pricing & Receipt Summary */}
        <section className="pk-detail-card" aria-label="Pricing summary">
          <div className="pk-detail-card-header">
            <div className="pk-row" style={{ gap: '0.5rem' }}>
              <CreditCardIcon size={18} />
              <h2 className="pk-detail-card-title">Receipt & Pricing</h2>
            </div>
            <span className={isPaid ? 'pk-badge pk-badge--confirmed' : 'pk-badge pk-badge--cancelled'}>
              {isPaid ? 'PAID' : 'NOT CHARGED'}
            </span>
          </div>

          <div style={{ padding: '0.25rem 0' }}>
            <PriceBreakdown
              lines={booking.lines.map((l) => ({
                label: lineLabel(l),
                amount: formatNaira(l.amountKobo),
              }))}
              totalLabel={isPaid ? 'Total Paid' : 'Total Quote'}
              totalAmount={formatNaira(booking.totalKobo)}
            />
          </div>

          <div style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
            <a
              href={`/bookings/${booking.id}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="pk-btn-secondary pk-btn-sm"
              style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
            >
              <ExternalLinkIcon size={14} />
              <span>View Official Tax Receipt & Invoice</span>
            </a>
          </div>

          <div className="pk-receipt-guarantee">
            <ShieldCheckIcon size={16} />
            <span>
              Exact total with no hidden gate charges. Regulated with a Lagos State Parking Authority (LASPA) permit.
            </span>
          </div>
        </section>
      </div>

      {/* Bottom Footer Actions */}
      <div className="pk-booking-detail-footer">
        <Link href="/bookings" className="pk-nav-pill">
          <ArrowLeftIcon size={16} />
          <span>View all my bookings</span>
        </Link>
        <Link href="/search" className="pk-btn-secondary pk-btn-sm">
          <SearchIcon size={14} />
          <span>Find more parking in Lagos</span>
        </Link>
      </div>
    </main>
  );
}

