import Link from 'next/link';
import { Text } from '@parkly/ui';
import { CorporateBrandHeader } from '../../../components/corporate/corporate-brand-header';
import {
  BanknoteIcon,
  BuildingIcon,
  CheckCircleIcon,
  LotsIcon,
  ShieldCheckIcon,
  TeamIcon,
} from '../../../components/icons';
import { publicEnv } from '../../../lib/env';

type DemoTenant = {
  legalName: string;
  portalTitle: string;
  primaryColor: string;
  secondaryColor: string;
  industry: string;
  emailDomain: string;
  welcomeMessage: string;
  costCenters: Array<{ code: string; name: string; budget: string; activePasses: number }>;
};

const DEMO_TENANTS: Record<string, DemoTenant> = {
  zenith: {
    legalName: 'Zenith Bank PLC',
    portalTitle: 'Corporate Mobility & Parking Management',
    primaryColor: '#E31837',
    secondaryColor: '#1E1E1E',
    industry: 'Banking & Financial Services',
    emailDomain: 'zenithbank.com',
    welcomeMessage:
      'Authorized corporate parking for Zenith Bank staff, fleet drivers, and executives across Nigeria.',
    costCenters: [
      {
        code: 'CC-HQ-101',
        name: 'Executive & Board Office',
        budget: '₦2,500,000',
        activePasses: 18,
      },
      {
        code: 'CC-FIN-204',
        name: 'Treasury & Corporate Accounts',
        budget: '₦3,800,000',
        activePasses: 42,
      },
      {
        code: 'CC-RET-305',
        name: 'Retail Banking & Operations',
        budget: '₦5,200,000',
        activePasses: 85,
      },
      {
        code: 'CC-FLT-402',
        name: 'Central Logistics & Fleet',
        budget: '₦4,100,000',
        activePasses: 60,
      },
    ],
  },
  kpmg: {
    legalName: 'KPMG Nigeria',
    portalTitle: 'Partner & Employee Parking Network',
    primaryColor: '#00338D',
    secondaryColor: '#001D4A',
    industry: 'Audit, Tax & Advisory',
    emailDomain: 'kpmg.com',
    welcomeMessage:
      'Seamless client-site and head office parking subsidies for KPMG partners and consultants.',
    costCenters: [
      { code: 'CC-AUD-01', name: 'Audit & Assurance', budget: '₦4,500,000', activePasses: 65 },
      {
        code: 'CC-TAX-02',
        name: 'Tax & Regulatory Services',
        budget: '₦2,800,000',
        activePasses: 38,
      },
      { code: 'CC-ADV-03', name: 'Management Consulting', budget: '₦3,900,000', activePasses: 52 },
    ],
  },
  dangote: {
    legalName: 'Dangote Industries Limited',
    portalTitle: 'Logistics & Employee Parking Portal',
    primaryColor: '#006A4E',
    secondaryColor: '#0D2818',
    industry: 'Manufacturing & Energy',
    emailDomain: 'dangote.com',
    welcomeMessage: 'Consolidated commercial vehicle fleet and staff parking portal.',
    costCenters: [
      {
        code: 'CC-REF-10',
        name: 'Lekki Refinery Operations',
        budget: '₦8,500,000',
        activePasses: 140,
      },
      {
        code: 'CC-CEM-20',
        name: 'Cement Commercial Fleet',
        budget: '₦6,200,000',
        activePasses: 95,
      },
      {
        code: 'CC-HQ-01',
        name: 'Ikoyi Global Headquarters',
        budget: '₦3,400,000',
        activePasses: 45,
      },
    ],
  },
};

type CorporateTenantApiResult = {
  id?: string;
  slug?: string;
  legalName?: string;
  industry?: string;
  billingTier?: string;
  branding?: {
    logoUrl?: string | null;
    primaryColor?: string;
    secondaryColor?: string;
    portalTitle?: string;
    welcomeMessage?: string | null;
  } | null;
  emailDomains?: string[];
};

export default async function CorporateTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenantKey = slug.toLowerCase();

  // 1. Attempt to fetch real tenant dynamically from API if registered
  let apiTenant: CorporateTenantApiResult | null = null;

  try {
    const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${tenantKey}`, {
      next: { revalidate: 0 },
    });
    if (res.ok) {
      apiTenant = (await res.json()) as CorporateTenantApiResult;
    }
  } catch {
    // API unavailable or running offline, fall back gracefully
  }

  const demoTenant = DEMO_TENANTS[tenantKey];

  const tenant = {
    legalName:
      apiTenant?.legalName ??
      demoTenant?.legalName ??
      `${slug.charAt(0).toUpperCase() + slug.slice(1)} Enterprise`,
    portalTitle:
      apiTenant?.branding?.portalTitle ??
      demoTenant?.portalTitle ??
      'Corporate Parking & Fleet Portal',
    logoUrl: apiTenant?.branding?.logoUrl ?? null,
    primaryColor: apiTenant?.branding?.primaryColor ?? demoTenant?.primaryColor ?? '#2563EB',
    secondaryColor: apiTenant?.branding?.secondaryColor ?? demoTenant?.secondaryColor ?? '#0F172A',
    industry: apiTenant?.industry ?? demoTenant?.industry ?? 'Enterprise Mobility',
    emailDomain: apiTenant?.emailDomains?.[0] ?? demoTenant?.emailDomain ?? `${tenantKey}.com`,
    welcomeMessage:
      apiTenant?.branding?.welcomeMessage ??
      demoTenant?.welcomeMessage ??
      'Dedicated corporate mobility and consolidated billing portal powered by Parkly.',
    costCenters: demoTenant?.costCenters ?? [
      { code: 'CC-GEN-01', name: 'General Operations', budget: '₦3,000,000', activePasses: 25 },
      { code: 'CC-HQ-02', name: 'Headquarters Staff', budget: '₦2,000,000', activePasses: 15 },
    ],
  };

  const totalPasses = tenant.costCenters.reduce((sum, cc) => sum + cc.activePasses, 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pk-color-bg-canvas)' }}>
      <CorporateBrandHeader
        legalName={tenant.legalName}
        portalTitle={tenant.portalTitle}
        logoUrl={tenant.logoUrl}
        primaryColor={tenant.primaryColor}
        secondaryColor={tenant.secondaryColor}
        welcomeMessage={tenant.welcomeMessage}
      />

      <main className="pk-page pk-page--wide">
        {/* 1. Enterprise Hero Header Card */}
        <div
          className="pk-card"
          style={{
            borderLeft: `4px solid ${tenant.primaryColor}`,
            padding: '1.75rem',
            background: 'var(--pk-color-bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  marginBottom: '0.5rem',
                }}
              >
                <span className="pk-badge pk-badge--live">● Enterprise Active</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
                  {tenant.industry}
                </span>
              </div>
              <Text variant="heading-xl">{tenant.legalName}</Text>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: '0.35rem', maxWidth: '640px', display: 'block' }}
              >
                Dedicated employer transit portal for employee pass subsidies, corporate department
                cost centers, and consolidated Net-30 monthly invoicing.
              </Text>
            </div>

            <div
              style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Link
                href="/sign-in"
                className="pk-button pk-button--primary"
                style={{
                  backgroundColor: tenant.primaryColor,
                  borderColor: tenant.primaryColor,
                  textDecoration: 'none',
                }}
              >
                Employee Single Sign-On
              </Link>
              <Link
                href="/onboarding"
                className="pk-button pk-button--secondary"
                style={{ textDecoration: 'none' }}
              >
                Admin Console
              </Link>
            </div>
          </div>
        </div>

        {/* 2. Key Tenancy Metrics / KPI Cards */}
        <div className="pk-stat-grid">
          {/* Dedicated Subdomain */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  color: 'var(--pk-color-text-brand)',
                }}
              >
                <BuildingIcon size={18} />
                <Text variant="label-lg" tone="brand">
                  Dedicated URL
                </Text>
              </div>
              <div
                className="pk-stat-count"
                style={{ fontSize: '1.35rem', fontFamily: 'monospace' }}
              >
                {tenantKey}.parkly.ng
              </div>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: '0.5rem', display: 'block' }}
              >
                Sovereign edge-routed corporate tenant address.
              </Text>
            </div>
          </div>

          {/* Verified Email Domain */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  color: 'var(--pk-color-text-brand)',
                }}
              >
                <ShieldCheckIcon size={18} />
                <Text variant="label-lg" tone="brand">
                  Email Domain
                </Text>
              </div>
              <div
                className="pk-stat-count"
                style={{
                  fontSize: '1.35rem',
                  color: 'var(--pk-color-text-brand)',
                  fontFamily: 'monospace',
                }}
              >
                @{tenant.emailDomain}
              </div>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: '0.5rem', display: 'block' }}
              >
                Automatic employee verification via domain SSO.
              </Text>
            </div>
          </div>

          {/* Active Employee Passes */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  color: 'var(--pk-color-text-brand)',
                }}
              >
                <LotsIcon size={18} />
                <Text variant="label-lg" tone="brand">
                  Active Passes
                </Text>
              </div>
              <div className="pk-stat-count">{totalPasses}</div>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: '0.5rem', display: 'block' }}
              >
                Monthly parking passes allocated across lots.
              </Text>
            </div>
          </div>

          {/* Consolidated Invoicing */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  color: 'var(--pk-color-text-brand)',
                }}
              >
                <BanknoteIcon size={18} />
                <Text variant="label-lg" tone="brand">
                  Billing
                </Text>
              </div>
              <div className="pk-stat-count" style={{ fontSize: '1.25rem' }}>
                Net-30 Monthly
              </div>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: '0.5rem', display: 'block' }}
              >
                Single itemized invoice with zero employee expense reports.
              </Text>
            </div>
          </div>
        </div>

        {/* 3. Dual-Profile Driver Linking Card */}
        <div
          className="pk-card"
          style={{
            padding: '1.5rem',
            background: 'var(--pk-color-bg-surface)',
            border: '1px solid var(--pk-color-border-default)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TeamIcon size={20} />
              <strong style={{ fontSize: '1rem', color: 'var(--pk-color-text-primary)' }}>
                Seamless Dual-Profile Driver Linking
              </strong>
            </div>
            <span className="pk-badge pk-badge--verified">
              1 Account · 2 Profiles (Personal + Corporate)
            </span>
          </div>

          <Text variant="body-md" tone="secondary" style={{ lineHeight: 1.5 }}>
            Are you a {tenant.legalName} employee who already uses the Parkly Driver mobile app for
            personal parking? You <strong>do not need to create a second account</strong> or
            download another app. Simply add your corporate email (
            <code className="pk-code">name@{tenant.emailDomain}</code>) in your mobile profile, and
            your existing account will instantly link to your company’s parking subsidy with a 1-tap
            profile switcher.
          </Text>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginTop: '0.5rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--pk-color-border-default)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <CheckCircleIcon
                size={18}
                style={{ color: 'var(--pk-color-text-brand)', marginTop: '2px' }}
              />
              <div>
                <strong style={{ fontSize: '0.85rem', display: 'block' }}>
                  Step 1: Open Mobile Profile
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
                  Go to Account → Work Email in Parkly app
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <CheckCircleIcon
                size={18}
                style={{ color: 'var(--pk-color-text-brand)', marginTop: '2px' }}
              />
              <div>
                <strong style={{ fontSize: '0.85rem', display: 'block' }}>
                  Step 2: Verify Work Email
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
                  Enter @{tenant.emailDomain} and verify 6-digit OTP
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <CheckCircleIcon
                size={18}
                style={{ color: 'var(--pk-color-text-brand)', marginTop: '2px' }}
              />
              <div>
                <strong style={{ fontSize: '0.85rem', display: 'block' }}>
                  Step 3: Switch Profiles
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
                  Toggle between Personal & Corporate at checkout
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Department Cost Centers */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <Text variant="heading-md" as="h2">
                Department Cost Centers
              </Text>
              <Text variant="body-sm" tone="secondary">
                Allocated monthly budgets and active parking quotas per organizational unit.
              </Text>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
              {tenant.costCenters.length} Cost Centers Configured
            </span>
          </div>

          <div className="pk-stat-grid">
            {tenant.costCenters.map((cc) => (
              <div key={cc.code} className="pk-stat-card">
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span className="pk-code" style={{ fontSize: '0.75rem' }}>
                      {cc.code}
                    </span>
                    <span className="pk-badge pk-badge--live" style={{ fontSize: '0.65rem' }}>
                      Active
                    </span>
                  </div>
                  <strong
                    style={{
                      fontSize: '0.95rem',
                      color: 'var(--pk-color-text-primary)',
                      display: 'block',
                    }}
                  >
                    {cc.name}
                  </strong>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--pk-color-text-secondary)',
                      marginTop: '0.35rem',
                    }}
                  >
                    Monthly Budget:{' '}
                    <strong style={{ color: 'var(--pk-color-text-primary)' }}>{cc.budget}</strong>
                  </div>
                </div>
                <div
                  style={{
                    paddingTop: '0.5rem',
                    borderTop: '1px solid var(--pk-color-border-default)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ color: 'var(--pk-color-text-secondary)' }}>Subsidized Passes</span>
                  <strong style={{ color: 'var(--pk-color-text-brand)' }}>
                    {cc.activePasses} passes
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Switch Demo Tenant Quick Links */}
        <div
          className="pk-card"
          style={{
            padding: '1rem 1.25rem',
            background: 'var(--pk-color-bg-surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            fontSize: '0.85rem',
          }}
        >
          <span style={{ color: 'var(--pk-color-text-secondary)' }}>
            Preview Other Verified Corporate Tenants:
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              href="/corp/zenith"
              className={`pk-button pk-button--sm ${tenantKey === 'zenith' ? 'pk-button--primary' : 'pk-button--secondary'}`}
              style={{ textDecoration: 'none' }}
            >
              Zenith Bank
            </Link>
            <Link
              href="/corp/kpmg"
              className={`pk-button pk-button--sm ${tenantKey === 'kpmg' ? 'pk-button--primary' : 'pk-button--secondary'}`}
              style={{ textDecoration: 'none' }}
            >
              KPMG Nigeria
            </Link>
            <Link
              href="/corp/dangote"
              className={`pk-button pk-button--sm ${tenantKey === 'dangote' ? 'pk-button--primary' : 'pk-button--secondary'}`}
              style={{ textDecoration: 'none' }}
            >
              Dangote Group
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
