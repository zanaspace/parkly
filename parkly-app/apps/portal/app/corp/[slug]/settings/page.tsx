import { CorporateBrandHeader } from '../../../../components/corporate/corporate-brand-header';
import { loadCorporateTenant } from '../data/corporate-tenant';
import { CorporateSettingsView } from './components/corporate-settings-view';

export const dynamic = 'force-dynamic';

export default async function CorporateSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await loadCorporateTenant(slug);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pk-color-bg-canvas)' }}>
      {/* 1. Sovereign Branded Topbar */}
      <CorporateBrandHeader
        legalName={tenant.legalName}
        portalTitle={tenant.portalTitle}
        logoUrl={tenant.logoUrl}
        primaryColor={tenant.primaryColor}
        secondaryColor={tenant.secondaryColor}
        welcomeMessage={tenant.welcomeMessage}
      />

      <main className="pk-page pk-page--wide" style={{ padding: '2rem 1rem' }}>
        <CorporateSettingsView tenant={tenant} slug={slug} />
      </main>
    </div>
  );
}
