import Link from 'next/link';
import { CorporateBrandHeader } from '../../../components/corporate/corporate-brand-header';

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
    portalTitle: 'Zenith Corporate Mobility & Parking Management',
    primaryColor: '#E31837',
    secondaryColor: '#1E1E1E',
    industry: 'Banking & Financial Services',
    emailDomain: 'zenithbank.com',
    welcomeMessage: 'Authorized corporate parking for Zenith Bank staff, fleet drivers, and executives across Nigeria.',
    costCenters: [
      { code: 'CC-HQ-101', name: 'Executive & Board Office', budget: '₦2,500,000', activePasses: 18 },
      { code: 'CC-FIN-204', name: 'Treasury & Corporate Accounts', budget: '₦3,800,000', activePasses: 42 },
      { code: 'CC-RET-305', name: 'Retail Banking & Operations', budget: '₦5,200,000', activePasses: 85 },
      { code: 'CC-FLT-402', name: 'Central Logistics & Fleet', budget: '₦4,100,000', activePasses: 60 },
    ],
  },
  kpmg: {
    legalName: 'KPMG Nigeria',
    portalTitle: 'KPMG Partner & Employee Parking Network',
    primaryColor: '#00338D',
    secondaryColor: '#001D4A',
    industry: 'Audit, Tax & Advisory',
    emailDomain: 'kpmg.com',
    welcomeMessage: 'Seamless client-site and head office parking subsidies for KPMG partners and consultants.',
    costCenters: [
      { code: 'CC-AUD-01', name: 'Audit & Assurance', budget: '₦4,500,000', activePasses: 65 },
      { code: 'CC-TAX-02', name: 'Tax & Regulatory Services', budget: '₦2,800,000', activePasses: 38 },
      { code: 'CC-ADV-03', name: 'Management Consulting', budget: '₦3,900,000', activePasses: 52 },
    ],
  },
  dangote: {
    legalName: 'Dangote Industries Limited',
    portalTitle: 'Dangote Logistics & Employee Parking Portal',
    primaryColor: '#006A4E',
    secondaryColor: '#0D2818',
    industry: 'Manufacturing & Energy',
    emailDomain: 'dangote.com',
    welcomeMessage: 'Consolidated commercial vehicle fleet and staff parking portal.',
    costCenters: [
      { code: 'CC-REF-10', name: 'Lekki Refinery Operations', budget: '₦8,500,000', activePasses: 140 },
      { code: 'CC-CEM-20', name: 'Cement Commercial Fleet', budget: '₦6,200,000', activePasses: 95 },
      { code: 'CC-HQ-01', name: 'Ikoyi Global Headquarters', budget: '₦3,400,000', activePasses: 45 },
    ],
  },
};

export default async function CorporateTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenantKey = slug.toLowerCase();
  const tenant = DEMO_TENANTS[tenantKey] ?? {
    legalName: `${slug.charAt(0).toUpperCase() + slug.slice(1)} Enterprise`,
    portalTitle: `${slug.toUpperCase()} Corporate Parking & Fleet Portal`,
    primaryColor: '#2563EB',
    secondaryColor: '#0F172A',
    industry: 'Enterprise Client',
    emailDomain: `${tenantKey}.com`,
    welcomeMessage: 'Dedicated corporate mobility and consolidated billing portal powered by Parkly.',
    costCenters: [
      { code: 'CC-GEN-01', name: 'General Operations', budget: '₦3,000,000', activePasses: 25 },
      { code: 'CC-HQ-02', name: 'Headquarters Staff', budget: '₦2,000,000', activePasses: 15 },
    ],
  };

  const totalPasses = tenant.costCenters.reduce((sum, cc) => sum + cc.activePasses, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <CorporateBrandHeader
        legalName={tenant.legalName}
        portalTitle={tenant.portalTitle}
        primaryColor={tenant.primaryColor}
        secondaryColor={tenant.secondaryColor}
        welcomeMessage={tenant.welcomeMessage}
      />

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Top Hero Banner */}
        <section
          className="rounded-2xl border border-zinc-800 p-8 shadow-2xl relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${tenant.primaryColor}15 0%, #09090b 80%)`,
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ● Enterprise Active
                </span>
                <span className="text-xs text-zinc-400">{tenant.industry}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {tenant.legalName} Corporate Parking
              </h1>
              <p className="text-sm text-zinc-400 max-w-2xl">
                Dedicated employer portal for employee pass subsidies, corporate cost centers, and single monthly consolidated billing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                Employee Single Sign-On
              </Link>
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Admin Console
              </Link>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-zinc-800/80 pt-6">
            <div>
              <div className="text-xs text-zinc-500">Dedicated URL</div>
              <div className="text-sm font-mono font-medium text-zinc-200 mt-1">
                {tenantKey}.parkly.ng
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Verified Email Domain</div>
              <div className="text-sm font-mono font-medium text-emerald-400 mt-1">
                @{tenant.emailDomain}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Active Employee Passes</div>
              <div className="text-sm font-semibold text-white mt-1">
                {totalPasses} Monthly Passes
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Billing Structure</div>
              <div className="text-sm font-semibold text-white mt-1">
                Consolidated Monthly Net-30
              </div>
            </div>
          </div>
        </section>

        {/* Dual-Profile Driver Linking Card */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-indigo-400">
                Seamless Dual-Profile Architecture
              </span>
              <h2 className="text-lg font-bold text-white mt-1">
                Are you an employee with an existing Parkly personal driver account?
              </h2>
              <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
                No need to create a second account or download another app. Simply verify your work email (
                <code className="text-xs text-emerald-300">name@{tenant.emailDomain}</code>) in your mobile profile, and your existing personal account instantly gains access to your corporate subsidies and pass roster with a 1-tap profile switcher!
              </p>
            </div>
            <div className="shrink-0">
              <span className="inline-flex items-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-300">
                1 Account · 2 Profiles (Personal + Corporate)
              </span>
            </div>
          </div>
        </section>

        {/* Department Cost Centers */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Department Cost Centers</h2>
              <p className="text-xs text-zinc-400">
                Allocated monthly budgets and active parking quotas per organizational unit.
              </p>
            </div>
            <span className="text-xs font-medium text-zinc-400">
              {tenant.costCenters.length} Cost Centers Configured
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tenant.costCenters.map((cc) => (
              <div
                key={cc.code}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 space-y-3 hover:border-zinc-700 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                    {cc.code}
                  </span>
                  <span className="text-xs font-medium text-emerald-400">Active</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm line-clamp-1">{cc.name}</h3>
                  <div className="text-xs text-zinc-400 mt-1">Monthly Budget: <span className="text-zinc-200 font-medium">{cc.budget}</span></div>
                </div>
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                  <span>Subsidized Passes</span>
                  <span className="font-semibold text-white">{cc.activePasses} active</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Switch Demo Tenant Quick Links */}
        <section className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
          <span>Preview Other Verified Corporate Tenants:</span>
          <div className="flex items-center gap-2">
            <Link
              href="/corp/zenith"
              className={`px-3 py-1 rounded-md font-medium border ${tenantKey === 'zenith' ? 'border-red-500 text-white bg-red-500/10' : 'border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}
            >
              Zenith Bank
            </Link>
            <Link
              href="/corp/kpmg"
              className={`px-3 py-1 rounded-md font-medium border ${tenantKey === 'kpmg' ? 'border-blue-500 text-white bg-blue-500/10' : 'border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}
            >
              KPMG Nigeria
            </Link>
            <Link
              href="/corp/dangote"
              className={`px-3 py-1 rounded-md font-medium border ${tenantKey === 'dangote' ? 'border-emerald-500 text-white bg-emerald-500/10' : 'border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}
            >
              Dangote Group
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
