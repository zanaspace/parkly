import type { DriverVerification, Pass, PublicLot, Vehicle } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { lagosDateKey } from '@parkly/domain/time';
import { Text } from '@parkly/ui';
import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddCarForm } from '../../components/booking-forms';
import {
  CarIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  SearchIcon,
  ShieldCheckIcon,
  TicketIcon,
} from '../../components/icons';
import { BuyPassForm, DriverVerificationCard } from '../../components/pass-forms';
import { api, apiAs, ApiProblem } from '../../lib/api';
import { requireDriver } from '../../lib/session';
import { createClient } from '../../lib/supabase/server';

export const metadata: Metadata = { title: 'Monthly Passes · Parkly' };

export default async function MonthlyPassesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; lotId?: string; waitlisted?: string }>;
}) {
  const q = await searchParams;
  const tab = q.status === 'past' ? 'past' : 'active';
  const nextPath = `/passes${q.lotId ? `?lotId=${encodeURIComponent(q.lotId)}` : ''}`;
  const driver = await requireDriver(nextPath);

  let items: Pass[];
  let verification: DriverVerification;
  let vehicles: Vehicle[];
  let selectedLot: PublicLot | null = null;

  try {
    [items, verification, vehicles] = await Promise.all([
      apiAs<{ items: Pass[] }>(driver.accessToken, `/v1/passes?status=${tab}`).then((r) => r.items),
      apiAs<DriverVerification>(driver.accessToken, '/v1/me/verification'),
      apiAs<{ items: Vehicle[] }>(driver.accessToken, '/v1/me/vehicles').then((r) => r.items),
    ]);
    if (q.lotId) {
      selectedLot = await api<PublicLot>(`/v1/lots/${encodeURIComponent(q.lotId)}`).catch(
        () => null,
      );
    }
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 401 || err.status === 403)) {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: 'local' });
      redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
    }
    throw err;
  }

  const monthlyPrice = selectedLot?.prices.find((p) => p.product === 'MONTHLY');
  const today = lagosDateKey(new Date());

  return (
    <main className="pk-page pk-bookings-page">
      <div className="pk-bookings-header">
        <div className="pk-bookings-header-meta">
          <span className="pk-badge pk-badge--brand-subtle">Monthly Commuter Passes</span>
          <h1 className="pk-bookings-title">Monthly Passes</h1>
          <p className="pk-bookings-subtitle">
            30-day passes with offline QR gate access, up to 2 vehicle swaps per month, and one-tap
            renewal.
          </p>
        </div>

        <nav className="pk-tabs-container" aria-label="Passes filter">
          <Link
            className={`pk-tab-pill ${tab === 'active' ? 'pk-tab-pill--active' : ''}`}
            href="/passes"
            aria-current={tab === 'active' ? 'page' : undefined}
          >
            <TicketIcon size={16} />
            <span>Active Passes</span>
          </Link>
          <Link
            className={`pk-tab-pill ${tab === 'past' ? 'pk-tab-pill--active' : ''}`}
            href="/passes?status=past"
            aria-current={tab === 'past' ? 'page' : undefined}
          >
            <ClockIcon size={16} />
            <span>Past</span>
          </Link>
        </nav>
      </div>

      {q.waitlisted === '1' && (
        <p className="pk-notice" role="status">
          You have been added to the monthly pass waitlist for this car park. We will notify you as
          soon as a pass bay opens up.
        </p>
      )}

      <DriverVerificationCard
        isVerified={verification.isVerifiedDriver}
        verifiedAt={verification.verifiedAt}
        idNumberMasked={verification.verification?.maskedIdNumber}
        back={nextPath}
        requiredForLot={Boolean(selectedLot?.requiresVerifiedDriver)}
      />

      {selectedLot && monthlyPrice?.monthlyRateKobo ? (
        selectedLot.requiresVerifiedDriver && !verification.isVerifiedDriver ? (
          <section className="pk-card pk-stack">
            <Text variant="heading-md" as="h2">
              {selectedLot.name} requires a Verified Driver badge
            </Text>
            <Text tone="secondary">
              Complete the 60-second verification above to purchase your monthly pass at{' '}
              {selectedLot.name}.
            </Text>
          </section>
        ) : vehicles.length === 0 ? (
          <section className="pk-card pk-stack">
            <Text variant="heading-md" as="h2">
              Add your car to buy a pass at {selectedLot.name}
            </Text>
            <AddCarForm back={nextPath} />
          </section>
        ) : (
          <BuyPassForm
            lotId={selectedLot.id}
            lotName={selectedLot.name}
            monthlyRateLabel={formatNaira(monthlyPrice.monthlyRateKobo)}
            vehicles={vehicles}
            defaultStartDate={today}
            idempotencyKey={randomUUID()}
            back={nextPath}
          />
        )
      ) : null}

      {items.length === 0 ? (
        <div className="pk-empty-state-card">
          <div className="pk-empty-icon-box">
            <TicketIcon size={34} />
          </div>
          <div className="pk-empty-content">
            <h2 className="pk-empty-title">
              {tab === 'active' ? 'No active monthly passes' : 'No past monthly passes'}
            </h2>
            <p className="pk-empty-description">
              Find a verified car park in Victoria Island, Ikoyi, Lekki, or Ikeja that offers
              monthly passes and lock in your guaranteed commuter bay.
            </p>
          </div>
          <Link href="/search" className="pk-btn-primary">
            <SearchIcon size={18} />
            <span>Browse Car Parks</span>
          </Link>
        </div>
      ) : (
        <div className="pk-bookings-grid">
          {items.map((p) => (
            <Link key={p.id} className="pk-booking-card" href={`/passes/${p.id}`}>
              <div className="pk-booking-card-header">
                <div className="pk-booking-card-lot">
                  <span className="pk-booking-card-name">{p.lot.name}</span>
                  {p.driverVerified && (
                    <span className="pk-badge pk-badge--verified">
                      <ShieldCheckIcon size={12} />
                      <span>Verified Driver</span>
                    </span>
                  )}
                </div>
                <span
                  className={`pk-badge ${
                    p.status === 'ACTIVE' ? 'pk-badge--confirmed' : 'pk-badge--cancelled'
                  }`}
                >
                  {p.status}
                </span>
              </div>

              <div className="pk-booking-card-details">
                <div className="pk-booking-card-meta">
                  <ClockIcon size={15} />
                  <span>
                    {p.periodStart} → {p.periodEnd} (30 days)
                  </span>
                </div>
                <div className="pk-booking-card-meta">
                  <CarIcon size={15} />
                  <span className="pk-plate-pill">{p.vehicle.plate}</span>
                  <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>
                    ({p.swapsRemaining}/2 swaps left)
                  </span>
                </div>
                {p.lot.addressLine ? (
                  <div className="pk-booking-card-meta pk-booking-card-address">
                    <MapPinIcon size={15} />
                    <span>{p.lot.addressLine}</span>
                  </div>
                ) : null}
              </div>

              <div className="pk-booking-card-footer">
                <div className="pk-booking-card-code-wrap">
                  <span className="pk-booking-code-label">Pass Code</span>
                  <code className="pk-code-badge">{p.code}</code>
                </div>
                <div className="pk-booking-card-price-wrap">
                  <span className="pk-booking-price">{formatNaira(p.totalKobo)}</span>
                  <span className="pk-booking-card-arrow">
                    <span>Open Pass</span>
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
