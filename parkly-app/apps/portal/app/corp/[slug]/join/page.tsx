import { CorporateBrandHeader } from '../../../../components/corporate/corporate-brand-header';
import { loadCorporateTenant } from '../data/corporate-tenant';
import { DriverJoinForm } from './components/driver-join-form';

export const dynamic = 'force-dynamic';

export default async function DriverJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ phone?: string; code?: string; joinCode?: string }>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const tenant = await loadCorporateTenant(slug);

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
      {/* 1. Sovereign Branded Topbar */}
      <CorporateBrandHeader
        legalName={tenant.legalName}
        portalTitle={tenant.portalTitle}
        logoUrl={tenant.logoUrl}
        primaryColor={tenant.primaryColor}
        secondaryColor={tenant.secondaryColor}
        welcomeMessage={tenant.welcomeMessage}
      />

      <main
        className="pk-page"
        style={{ padding: '2rem 1rem', width: '100%', boxSizing: 'border-box' }}
      >
        <DriverJoinForm
          tenant={tenant}
          slug={slug}
          initialPhone={query.phone}
          initialCode={query.code || query.joinCode}
        />
      </main>
    </div>
  );
}
