import { CorporateBrandHeader } from '../../../../components/corporate/corporate-brand-header';
import { CorporateNavTabs } from '../components/corporate-nav-tabs';
import { loadCorporateFinance, loadCorporateTenant } from '../data/corporate-tenant';
import { CorporateFinanceView } from './components/corporate-finance-view';

export const dynamic = 'force-dynamic';

export default async function CorporateFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ period?: string }>;
}) {
  const { slug } = await params;
  const sParams = await searchParams;
  const tenant = await loadCorporateTenant(slug);
  const finance = await loadCorporateFinance(slug, sParams?.period);

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
        <CorporateFinanceView
          tenant={tenant}
          finance={finance}
          slug={slug}
          primaryColor={tenant.primaryColor}
        />
      </main>
    </div>
  );
}
