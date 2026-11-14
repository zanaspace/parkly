'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Text } from '@parkly/ui';
import { CheckCircleIcon } from '../../../components/icons';

const PRESET_COLORS = [
  { name: 'Red', hex: '#E31837' },
  { name: 'Blue', hex: '#00338D' },
  { name: 'Orange', hex: '#F58220' },
  { name: 'Green', hex: '#006A4E' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Purple', hex: '#6366F1' },
];

export function CorporateOnboardingForm({ apiUrl }: { apiUrl: string }) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTenant, setSuccessTenant] = useState<{ slug: string; legalName: string } | null>(
    null,
  );

  // Step 1: Organization
  const [legalName, setLegalName] = useState('');
  const [cacRcNumber, setCacRcNumber] = useState('');
  const [slug, setSlug] = useState('');
  const [industry, setIndustry] = useState('Banking & Financial Services');
  const [headOfficeAddress, setHeadOfficeAddress] = useState('');
  const [primaryContactName, setPrimaryContactName] = useState('');
  const [primaryContactEmail, setPrimaryContactEmail] = useState('');
  const [primaryContactPhone, setPrimaryContactPhone] = useState('');

  // Step 2: Brand
  const [primaryColor, setPrimaryColor] = useState('#E31837');
  const [portalTitle, setPortalTitle] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Step 3: Domain & Cost Center
  const [emailDomain, setEmailDomain] = useState('');
  const [costCenterCode, setCostCenterCode] = useState('CC-HQ-01');
  const [costCenterName, setCostCenterName] = useState('Headquarters Staff');
  const [monthlyBudgetKobo, setMonthlyBudgetKobo] = useState('250000000'); // 2,500,000 NGN in kobo

  // Auto-slugify when legal name changes if slug wasn't manually touched
  const handleLegalNameChange = (val: string) => {
    setLegalName(val);
    if (!portalTitle) {
      setPortalTitle(`${val} Employee Parking & Mobility Portal`);
    }
    const derivedSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    if (!slug || slug === derivedSlug.slice(0, slug.length)) {
      setSlug(derivedSlug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const payload = {
        legalName: legalName.trim(),
        cacRcNumber: cacRcNumber.trim(),
        slug: slug.trim().toLowerCase(),
        industry,
        headOfficeAddress: headOfficeAddress.trim() || 'Lagos, Nigeria',
        primaryContactName: primaryContactName.trim(),
        primaryContactEmail: primaryContactEmail.trim().toLowerCase(),
        primaryContactPhone: primaryContactPhone.trim(),
        emailDomain: emailDomain.toLowerCase().replace(/^@/, '').trim(),
        branding: {
          logoUrl: logoUrl.trim() || undefined,
          primaryColor,
          secondaryColor: '#1E1E1E',
          portalTitle: portalTitle.trim() || `${legalName} Corporate Parking Portal`,
          welcomeMessage:
            welcomeMessage.trim() || `Welcome to ${legalName} employee and fleet parking portal.`,
        },
        costCenter: {
          code: costCenterCode.trim(),
          name: costCenterName.trim(),
          monthlyBudgetKobo: monthlyBudgetKobo ? parseInt(monthlyBudgetKobo, 10) : undefined,
        },
      };

      const res = await fetch(`${apiUrl}/v1/corp/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await res.json()) as {
        code?: string;
        detail?: string;
        slug?: string;
        legalName?: string;
      };

      if (!res.ok) {
        throw new Error(
          body.detail || body.code || `Registration failed with status ${res.status}`,
        );
      }

      setSuccessTenant({
        slug: body.slug || slug.trim().toLowerCase(),
        legalName: body.legalName || legalName.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during onboarding');
    } finally {
      setBusy(false);
    }
  };

  if (successTenant) {
    return (
      <div
        className="pk-card"
        style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '640px', margin: '2rem auto' }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '1rem',
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            color: '#10B981',
            marginBottom: '1.25rem',
          }}
        >
          <CheckCircleIcon size={48} />
        </div>
        <Text variant="heading-xl">Corporate Subdomain Created!</Text>
        <Text
          variant="body-md"
          tone="secondary"
          style={{ marginTop: '0.5rem', marginBottom: '1.5rem', display: 'block' }}
        >
          <strong>{successTenant.legalName}</strong> is now registered on Parkly Corporate. Your
          sovereign dedicated subdomain and employee SSO directory are active.
        </Text>

        <div
          className="pk-card"
          style={{
            background: 'var(--pk-color-bg-canvas)',
            padding: '1.25rem',
            marginBottom: '1.75rem',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--pk-color-text-secondary)',
              marginBottom: '0.25rem',
            }}
          >
            Dedicated Tenant URL
          </div>
          <code
            className="pk-code"
            style={{ fontSize: '1rem', color: 'var(--pk-color-text-brand)' }}
          >
            https://{successTenant.slug}.parkly.ng
          </code>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pk-button pk-button--primary pk-button--lg"
            onClick={() => router.push(`/corp/${successTenant.slug}`)}
          >
            Launch Branded Tenant Portal →
          </button>
          <Link
            href="/onboarding"
            className="pk-button pk-button--secondary pk-button--lg"
            style={{ textDecoration: 'none' }}
          >
            Go to Admin Overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '2rem',
        alignItems: 'start',
      }}
    >
      {/* Left Form Column */}
      <div className="pk-card" style={{ padding: '2rem' }}>
        {/* Step Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--pk-color-border-default)',
            paddingBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {[
              { num: 1, label: 'Company' },
              { num: 2, label: 'Branding' },
              { num: 3, label: 'Domain & Fleet' },
            ].map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num as 1 | 2 | 3)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color:
                    step === s.num
                      ? 'var(--pk-color-text-brand)'
                      : 'var(--pk-color-text-secondary)',
                  fontWeight: step === s.num ? 700 : 500,
                  fontSize: '0.85rem',
                }}
              >
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor:
                      step === s.num
                        ? 'var(--pk-color-text-brand)'
                        : 'var(--pk-color-border-default)',
                    color: step === s.num ? '#ffffff' : 'var(--pk-color-text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                  }}
                >
                  {s.num}
                </span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <span className="pk-badge pk-badge--live">Step {step} of 3</span>
        </div>

        {error && (
          <div className="pk-notice pk-notice--error" style={{ marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="pk-form">
          {/* STEP 1: ORGANIZATION */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="pk-label" htmlFor="corp-legalName">
                  Company Legal Name *
                </label>
                <input
                  id="corp-legalName"
                  className="pk-input"
                  placeholder="e.g. Zenith Bank PLC"
                  value={legalName}
                  onChange={(e) => handleLegalNameChange(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="pk-label" htmlFor="corp-rc">
                    CAC / RC Number *
                  </label>
                  <input
                    id="corp-rc"
                    className="pk-input"
                    placeholder="e.g. RC-184920"
                    value={cacRcNumber}
                    onChange={(e) => setCacRcNumber(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="pk-label" htmlFor="corp-industry">
                    Industry Sector
                  </label>
                  <select
                    id="corp-industry"
                    className="pk-input"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  >
                    <option value="Banking & Financial Services">Banking & Finance</option>
                    <option value="Consulting & Advisory">Consulting & Advisory</option>
                    <option value="Energy & Utilities">Energy & Utilities</option>
                    <option value="Logistics & Transport">Logistics & Supply Chain</option>
                    <option value="Technology & SaaS">Technology</option>
                    <option value="FMCG & Manufacturing">Manufacturing</option>
                    <option value="Other Enterprise">Other Enterprise</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="pk-label" htmlFor="corp-slug">
                  Choose Your Dedicated Subdomain *
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    id="corp-slug"
                    className="pk-input"
                    placeholder="e.g. zenith"
                    value={slug}
                    onChange={(e) =>
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    }
                    required
                  />
                  <span
                    style={{
                      fontSize: '0.9rem',
                      color: 'var(--pk-color-text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    .parkly.ng
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--pk-color-text-secondary)',
                    marginTop: '0.25rem',
                  }}
                >
                  Your sovereign URL: <strong>https://{slug || 'company'}.parkly.ng</strong>
                </div>
              </div>

              <div>
                <label className="pk-label" htmlFor="corp-address">
                  Head Office Address
                </label>
                <input
                  id="corp-address"
                  className="pk-input"
                  placeholder="e.g. Victoria Island, Lagos, Nigeria"
                  value={headOfficeAddress}
                  onChange={(e) => setHeadOfficeAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="pk-label" htmlFor="corp-admin-name">
                  Primary Contact Name *
                </label>
                <input
                  id="corp-admin-name"
                  className="pk-input"
                  placeholder="e.g. Ebube Okafor"
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="pk-label" htmlFor="corp-admin-email">
                    Work Email *
                  </label>
                  <input
                    id="corp-admin-email"
                    type="email"
                    className="pk-input"
                    placeholder="e.g. e.okafor@company.com"
                    value={primaryContactEmail}
                    onChange={(e) => setPrimaryContactEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="pk-label" htmlFor="corp-admin-phone">
                    Contact Phone *
                  </label>
                  <input
                    id="corp-admin-phone"
                    className="pk-input"
                    placeholder="e.g. +234 803 000 0000"
                    value={primaryContactPhone}
                    onChange={(e) => setPrimaryContactPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="pk-button pk-button--primary"
                  onClick={() => {
                    if (
                      !legalName ||
                      !cacRcNumber ||
                      !slug ||
                      !primaryContactName ||
                      !primaryContactEmail ||
                      !primaryContactPhone
                    ) {
                      setError('Please complete all required fields in Step 1.');
                      return;
                    }
                    setError(null);
                    setStep(2);
                  }}
                >
                  Continue to Brand Customization →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: BRANDING */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="pk-label">Corporate Primary Theme Color</label>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.75rem',
                  }}
                >
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setPrimaryColor(c.hex)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '6px',
                        border:
                          primaryColor === c.hex
                            ? '2px solid #ffffff'
                            : '1px solid var(--pk-color-border-default)',
                        backgroundColor: c.hex,
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    style={{
                      width: '40px',
                      height: '36px',
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    className="pk-input"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    style={{ width: '120px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div>
                <label className="pk-label" htmlFor="corp-portalTitle">
                  Portal Title *
                </label>
                <input
                  id="corp-portalTitle"
                  className="pk-input"
                  placeholder="e.g. Zenith Bank Workplace Mobility"
                  value={portalTitle}
                  onChange={(e) => setPortalTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="pk-label" htmlFor="corp-welcome">
                  Portal Welcome Banner Note
                </label>
                <textarea
                  id="corp-welcome"
                  className="pk-input"
                  rows={2}
                  placeholder="e.g. Authorized staff and fleet parking for Zenith Bank branches and headquarters."
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                />
              </div>

              <div>
                <label className="pk-label" htmlFor="corp-logo">
                  Logo Image URL (Optional)
                </label>
                <input
                  id="corp-logo"
                  className="pk-input"
                  placeholder="https://... (SVG, PNG, or WebP logo)"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="pk-button pk-button--secondary"
                  onClick={() => setStep(1)}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="pk-button pk-button--primary"
                  onClick={() => {
                    setError(null);
                    setStep(3);
                  }}
                >
                  Continue to Domains & Fleet →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DOMAINS & COST CENTER */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="pk-label" htmlFor="corp-domain">
                  Authorized Employee Email Domain *
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--pk-color-text-secondary)' }}>
                    @
                  </span>
                  <input
                    id="corp-domain"
                    className="pk-input"
                    placeholder="e.g. zenithbank.com"
                    value={emailDomain}
                    onChange={(e) => setEmailDomain(e.target.value.toLowerCase().replace(/^@/, ''))}
                    required
                  />
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--pk-color-text-secondary)',
                    marginTop: '0.25rem',
                  }}
                >
                  Any staff signing into Parkly with this email domain will automatically link to
                  your corporate account!
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div>
                  <label className="pk-label" htmlFor="corp-cc-code">
                    Cost Center Code
                  </label>
                  <input
                    id="corp-cc-code"
                    className="pk-input"
                    value={costCenterCode}
                    onChange={(e) => setCostCenterCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="pk-label" htmlFor="corp-cc-name">
                    Department Name
                  </label>
                  <input
                    id="corp-cc-name"
                    className="pk-input"
                    value={costCenterName}
                    onChange={(e) => setCostCenterName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="pk-label">Initial Monthly Budget (₦)</label>
                <input
                  type="number"
                  className="pk-input"
                  value={Math.round(parseInt(monthlyBudgetKobo || '0', 10) / 100)}
                  onChange={(e) =>
                    setMonthlyBudgetKobo((parseInt(e.target.value || '0', 10) * 100).toString())
                  }
                />
              </div>

              <div
                className="pk-card"
                style={{
                  background: 'var(--pk-color-bg-canvas)',
                  padding: '1rem',
                  marginTop: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircleIcon size={18} style={{ color: '#10B981' }} />
                  <strong style={{ fontSize: '0.85rem' }}>
                    Consolidated Net-30 Invoicing Included
                  </strong>
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--pk-color-text-secondary)',
                    marginTop: '0.25rem',
                  }}
                >
                  Your enterprise account receives itemized monthly billing. No employee expense
                  receipts or credit cards required.
                </div>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}
              >
                <button
                  type="button"
                  className="pk-button pk-button--secondary"
                  onClick={() => setStep(2)}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="pk-button pk-button--primary pk-button--lg"
                  style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                >
                  {busy ? 'Activating Subdomain...' : 'Activate Corporate Tenant & Subdomain →'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Right Column: Live Interactive Tenant Preview */}
      <div style={{ position: 'sticky', top: '1.5rem' }}>
        <div
          style={{
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--pk-color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Live Tenant Preview
          </span>
          <span className="pk-badge pk-badge--verified" style={{ fontSize: '0.7rem' }}>
            Live Preview
          </span>
        </div>

        <div
          className="pk-card"
          style={{
            borderLeft: `4px solid ${primaryColor}`,
            padding: '1.5rem',
            background: 'var(--pk-color-bg-surface)',
          }}
        >
          {/* Header Preview */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: primaryColor,
                color: '#ffffff',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
              }}
            >
              {(legalName || 'Company').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div
                style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--pk-color-text-primary)' }}
              >
                {legalName || 'Your Company Legal Name'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
                {portalTitle || 'Corporate Parking Portal'}
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--pk-color-text-muted)',
              marginBottom: '1.25rem',
              lineHeight: 1.4,
            }}
          >
            {welcomeMessage ||
              'Authorized staff and fleet parking subsidies for your company employees.'}
          </div>

          {/* Mini Stat Grid Preview */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--pk-color-border-default)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--pk-color-text-secondary)' }}>
                Subdomain URL
              </div>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--pk-color-text-brand)',
                  fontFamily: 'monospace',
                }}
              >
                {slug || 'company'}.parkly.ng
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--pk-color-text-secondary)' }}>
                Auto-Join Domain
              </div>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--pk-color-text-brand)',
                  fontFamily: 'monospace',
                }}
              >
                @{emailDomain || 'company.com'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--pk-color-text-secondary)' }}>
                Department Cost Center
              </div>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--pk-color-text-primary)',
                }}
              >
                {costCenterCode || 'CC-HQ-01'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--pk-color-text-secondary)' }}>
                Billing Cycle
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10B981' }}>
                Net-30 Direct Debit
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
