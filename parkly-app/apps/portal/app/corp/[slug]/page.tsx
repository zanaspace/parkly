import { CorporateBrandHeader } from '../../../components/corporate/corporate-brand-header';
import { CorporateCostCenters } from './components/corporate-cost-centers';
import { CorporateDualProfile } from './components/corporate-dual-profile';
import { CorporateHero } from './components/corporate-hero';
import { CorporateKpis } from './components/corporate-kpis';
import { loadCorporateTenant } from './data/corporate-tenant';

export default async function CorporateTenantPage({
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

      <main className="pk-page pk-page--wide">
        {/* 2. Enterprise Hero Card */}
        <CorporateHero tenant={tenant} />

        {/* 3. Tenancy Metrics / KPI Cards */}
        <CorporateKpis tenant={tenant} slug={slug} />

        {/* 4. Dual-Profile Driver Linking */}
        <CorporateDualProfile tenant={tenant} />

        {/* 5. Department Cost Centers & Tenant Switcher */}
        <CorporateCostCenters tenant={tenant} slug={slug} />
      </main>
    </div>
  );
}
