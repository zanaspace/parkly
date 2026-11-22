import type { CorporateBookingItem, CorporateFinanceSummary } from '@parkly/contracts';
import { publicEnv } from '../../../../lib/env';

export type DemoCostCenter = {
  code: string;
  name: string;
  budget: string;
  activePasses: number;
};

export type DemoTenant = {
  legalName: string;
  portalTitle: string;
  primaryColor: string;
  secondaryColor: string;
  industry: string;
  emailDomain: string;
  welcomeMessage: string;
  costCenters: DemoCostCenter[];
};

export type CorporateTenantApiResult = {
  id?: string;
  slug?: string;
  legalName?: string;
  cacRcNumber?: string;
  industry?: string;
  headOfficeAddress?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
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

export type ResolvedTenant = {
  id?: string;
  slug: string;
  legalName: string;
  cacRcNumber?: string;
  headOfficeAddress?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  portalTitle: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  industry: string;
  emailDomain: string;
  welcomeMessage: string;
  costCenters: DemoCostCenter[];
  totalPasses: number;
};

export const DEMO_TENANTS: Record<string, DemoTenant> = {
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

export async function loadCorporateTenant(slug: string): Promise<ResolvedTenant> {
  const tenantKey = slug.toLowerCase();
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

  const costCenters = demoTenant?.costCenters ?? [
    { code: 'CC-GEN-01', name: 'General Operations', budget: '₦3,000,000', activePasses: 25 },
    { code: 'CC-HQ-02', name: 'Headquarters Staff', budget: '₦2,000,000', activePasses: 15 },
  ];

  const totalPasses = costCenters.reduce((sum, cc) => sum + cc.activePasses, 0);

  return {
    id: apiTenant?.id,
    slug: apiTenant?.slug ?? tenantKey,
    legalName:
      apiTenant?.legalName ??
      demoTenant?.legalName ??
      `${slug.charAt(0).toUpperCase() + slug.slice(1)} Enterprise`,
    cacRcNumber: apiTenant?.cacRcNumber ?? 'RC-992812',
    headOfficeAddress:
      apiTenant?.headOfficeAddress ?? 'Corporate Headquarters, Victoria Island, Lagos, Nigeria',
    primaryContactName: apiTenant?.primaryContactName ?? 'Operations Director',
    primaryContactEmail: apiTenant?.primaryContactEmail ?? `admin@${tenantKey}.com`,
    primaryContactPhone: apiTenant?.primaryContactPhone ?? '+2348000000000',
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
    costCenters,
    totalPasses,
  };
}

export async function loadCorporateBookings(
  slug: string,
): Promise<{ bookings: CorporateBookingItem[]; total: number }> {
  const tenantKey = slug.toLowerCase();
  try {
    const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${tenantKey}/bookings`, {
      next: { revalidate: 0 },
    });
    if (res.ok) {
      return (await res.json()) as { bookings: CorporateBookingItem[]; total: number };
    }
  } catch {
    // API unavailable or offline fallback
  }
  return { bookings: [], total: 0 };
}

export async function loadCorporateFinance(
  slug: string,
  period?: string,
): Promise<CorporateFinanceSummary | null> {
  const tenantKey = slug.toLowerCase();
  try {
    const query = period ? `?period=${period}` : '';
    const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${tenantKey}/finance${query}`, {
      next: { revalidate: 0 },
    });
    if (res.ok) {
      return (await res.json()) as CorporateFinanceSummary;
    }
  } catch {
    // API unavailable or offline fallback
  }
  return null;
}
