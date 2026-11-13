import type { Pass, Vehicle } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeftIcon,
  CalendarIcon,
  CarIcon,
  MapPinIcon,
  ShieldCheckIcon,
  TicketIcon,
} from '../../../components/icons';
import { PassManageActions } from '../../../components/pass-forms';
import { QrCode } from '../../../components/qr-code';
import { apiAs, ApiProblem } from '../../../lib/api';
import { requireDriver } from '../../../lib/session';
import { createClient } from '../../../lib/supabase/server';

export const metadata: Metadata = { title: 'Your Monthly Pass · Parkly' };

export default async function PassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = await requireDriver(`/passes/${id}`);
  let pass: Pass;
  let vehicles: Vehicle[];
  try {
    [pass, vehicles] = await Promise.all([
      apiAs<Pass>(driver.accessToken, `/v1/passes/${encodeURIComponent(id)}`),
      apiAs<{ items: Vehicle[] }>(driver.accessToken, '/v1/me/vehicles').then((r) => r.items),
    ]);
  } catch (err) {
    if (err instanceof ApiProblem) {
      if (err.status === 404 || err.status === 400) notFound();
      if (err.status === 401 || err.status === 403) {
        const supabase = await createClient();
        await supabase.auth.signOut({ scope: 'local' });
        redirect(`/sign-in?next=${encodeURIComponent(`/passes/${id}`)}`);
      }
    }
    throw err;
  }

  return (
    <main className="pk-page pk-booking-detail-page">
      <div className="pk-booking-detail-topbar">
        <Link href="/passes" className="pk-nav-pill" style={{ paddingLeft: '0.65rem' }}>
          <ArrowLeftIcon size={16} />
          <span>Back to Monthly Passes</span>
        </Link>
        <span className="pk-ref-code">MONTHLY PASS #{pass.code}</span>
      </div>

      <div className="pk-booking-detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span
            className={`pk-badge ${
              pass.status === 'ACTIVE' ? 'pk-badge--confirmed' : 'pk-badge--pending'
            }`}
          >
            {pass.status}
          </span>
          {pass.driverVerified && (
            <span className="pk-badge pk-badge--verified">
              <ShieldCheckIcon size={12} />
              <span>Verified Driver</span>
            </span>
          )}
          {pass.inLot && <span className="pk-badge pk-badge--checkedin">Currently in Lot</span>}
        </div>

        <Text variant="heading-xl" as="h1" className="pk-booking-detail-title">
          30-Day Monthly Pass · {pass.lot.name}
        </Text>
        <p className="pk-booking-detail-sub">
          Valid {pass.periodStart} to {pass.periodEnd} · {pass.lot.addressLine}
        </p>
      </div>

      {pass.status === 'ACTIVE' && (
        <section className="pk-ticket-pass" aria-label="Digital monthly pass QR ticket">
          <div className="pk-ticket-pass-header">
            <div className="pk-row" style={{ gap: '0.5rem' }}>
              <TicketIcon size={18} />
              <span className="pk-ticket-pass-title">Official Parkly Monthly Pass (P)</span>
            </div>
            <span className="pk-ticket-pass-subtitle">
              1 vehicle in the lot at a time · Scan at gate
            </span>
          </div>

          <div className="pk-ticket-pass-body">
            {pass.qrToken && (
              <div className="pk-ticket-pass-qr">
                <div className="pk-qr-container">
                  <QrCode value={pass.qrToken} label={`QR ticket for monthly pass ${pass.code}`} />
                </div>
                <span className="pk-ticket-pass-scan-hint">Offline Ed25519 Signed Pass QR</span>
              </div>
            )}

            <div className="pk-ticket-pass-details">
              <div className="pk-ticket-code-block">
                <span className="pk-ticket-code-label">Monthly Pass Code</span>
                <span className="pk-ticket-code-value">{pass.code}</span>
              </div>

              <div className="pk-ticket-info-grid">
                <div>
                  <span className="pk-ticket-info-label">Active Vehicle Plate</span>
                  <span className="pk-plate-pill pk-plate-pill--lg">{pass.vehicle.plate}</span>
                </div>
                <div>
                  <span className="pk-ticket-info-label">Vehicle Swaps</span>
                  <span className="pk-ticket-lot-name">
                    {pass.swapsUsed} used · {pass.swapsRemaining} remaining
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="pk-booking-detail-grid">
        <section className="pk-detail-card" aria-label="Pass details">
          <div className="pk-detail-card-header">
            <h2 className="pk-detail-card-title">Pass Coverage & Rules</h2>
            <span className="pk-badge pk-badge--brand-subtle">{formatNaira(pass.totalKobo)}</span>
          </div>

          <div className="pk-detail-rows">
            <div className="pk-detail-item">
              <div className="pk-detail-item-icon">
                <MapPinIcon size={18} />
              </div>
              <div className="pk-detail-item-content">
                <strong className="pk-detail-item-title">{pass.lot.name}</strong>
                <p className="pk-detail-item-desc">{pass.lot.addressLine}</p>
              </div>
            </div>

            <div className="pk-detail-item">
              <div className="pk-detail-item-icon">
                <CalendarIcon size={18} />
              </div>
              <div className="pk-detail-item-content">
                <strong className="pk-detail-item-title">30-Day Period</strong>
                <p className="pk-detail-item-desc">
                  {pass.periodStart} through {pass.periodEnd} (reminders sent 7 days and 2 days
                  before expiry)
                </p>
              </div>
            </div>

            <div className="pk-detail-item">
              <div className="pk-detail-item-icon">
                <CarIcon size={18} />
              </div>
              <div className="pk-detail-item-content">
                <strong className="pk-detail-item-title">One Vehicle in Lot at a Time</strong>
                <p className="pk-detail-item-desc">
                  Your pass guarantees 1 reserved bay. Check out before entering again or swapping
                  vehicles.
                </p>
              </div>
            </div>
          </div>
        </section>

        <PassManageActions pass={pass} vehicles={vehicles} />
      </div>
    </main>
  );
}
