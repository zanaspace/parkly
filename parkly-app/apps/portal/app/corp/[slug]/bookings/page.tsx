import { CorporateBrandHeader } from '../../../../components/corporate/corporate-brand-header';
import { CorporateNavTabs } from '../components/corporate-nav-tabs';
import { loadCorporateBookings, loadCorporateTenant } from '../data/corporate-tenant';
import { CorporateBookingsTable } from './components/corporate-bookings-table';

export const dynamic = 'force-dynamic';

export default async function CorporateBookingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await loadCorporateTenant(slug);
  const { bookings } = await loadCorporateBookings(slug);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        maxWidth: '100vw',
        overflowX: 'hidden',
        background: 'var(--pk-color-bg-canvas)',
      }}
    >
      <CorporateBrandHeader
        legalName={tenant.legalName}
        portalTitle={tenant.portalTitle}
        logoUrl={tenant.logoUrl}
        primaryColor={tenant.primaryColor}
        secondaryColor={tenant.secondaryColor}
        welcomeMessage={tenant.welcomeMessage}
      />

      <CorporateNavTabs slug={slug} primaryColor={tenant.primaryColor} />

      <main className="pk-page pk-page--wide" style={{ padding: '1.5rem 1rem' }}>
        <CorporateBookingsTable bookings={bookings} primaryColor={tenant.primaryColor} />
      </main>
    </div>
  );
}
