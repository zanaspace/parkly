'use client';

import { Select } from '@parkly/ui';
import Link from 'next/link';
import { useState } from 'react';
import { GoogleIcon } from '../../../../components/icons';
import { getGoogleOAuthUrl } from '../../../../lib/auth/actions';
import { getTenantUrl } from '../../../../lib/tenant-url';
import { INDUSTRY_OPTIONS, type OnboardingFormFields } from '../data/onboarding-api';

type StepCompanyProps = {
  fields: OnboardingFormFields;
  currentUser?: { signedIn: boolean; email: string | null };
  setField: <K extends keyof OnboardingFormFields>(key: K, value: OnboardingFormFields[K]) => void;
  handleLegalNameChange: (val: string) => void;
  onContinue: () => void;
};

export function StepCompany({
  fields,
  currentUser,
  setField,
  handleLegalNameChange,
  onContinue,
}: StepCompanyProps) {
  const urlInfo = getTenantUrl(fields.slug);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleGoogleAuth = async () => {
    try {
      setGoogleLoading(true);
      setGoogleError(null);
      const url = await getGoogleOAuthUrl('/corporate/onboarding');
      if (url) window.location.href = url;
    } catch (err) {
      setGoogleLoading(false);
      setGoogleError(err instanceof Error ? err.message : 'Google sign-in could not be initiated.');
    }
  };

  const handleEmailChange = (val: string) => {
    setField('primaryContactEmail', val);
    if (val.includes('@')) {
      const domain = val.split('@')[1]?.toLowerCase().trim();
      if (
        domain &&
        domain.includes('.') &&
        !domain.includes('gmail.') &&
        !domain.includes('yahoo.')
      ) {
        if (!fields.emailDomain || fields.emailDomain === fields.slug)
          setField('emailDomain', domain);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* SECTION 1: Company Profile */}
      <div className="pk-card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
        <div
          style={{
            borderBottom: '1px solid var(--pk-color-border-default)',
            paddingBottom: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <span className="pk-badge pk-badge--brand-subtle" style={{ fontSize: '0.7rem' }}>
            Step 1 · Company
          </span>
          <h2 style={{ fontSize: '1.05rem', margin: '0.25rem 0 0.1rem 0', fontWeight: 700 }}>
            Company Information
          </h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
            Enter your legal entity details for corporate invoicing and sovereign subdomain
            reservation.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label className="pk-label" htmlFor="corp-legalName">
              Company Legal Name *
            </label>
            <input
              id="corp-legalName"
              className="pk-input"
              placeholder="e.g. Zenith Bank PLC"
              value={fields.legalName}
              onChange={(e) => handleLegalNameChange(e.target.value)}
              required
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div>
              <label className="pk-label" htmlFor="corp-rc">
                CAC / RC Number *
              </label>
              <input
                id="corp-rc"
                className="pk-input"
                placeholder="e.g. RC-184920"
                value={fields.cacRcNumber}
                onChange={(e) => setField('cacRcNumber', e.target.value)}
                required
              />
            </div>
            <div>
              <Select
                label="Industry Sector"
                name="industry"
                value={fields.industry}
                options={INDUSTRY_OPTIONS}
                onValueChange={(val) => setField('industry', val)}
              />
            </div>
          </div>

          <div>
            <label className="pk-label" htmlFor="corp-slug">
              Dedicated Sovereign Subdomain *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                id="corp-slug"
                className="pk-input"
                placeholder="e.g. zenith"
                value={fields.slug}
                onChange={(e) =>
                  setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
                required
              />
              <span
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--pk-color-text-secondary)',
                  fontWeight: 600,
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
              Active Address:{' '}
              <strong style={{ color: 'var(--pk-color-text-brand)' }}>{urlInfo.activeUrl}</strong>
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
              value={fields.headOfficeAddress}
              onChange={(e) => setField('headOfficeAddress', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: Administrator Account & Access (Unified Credentials) */}
      <div className="pk-card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
        <div
          style={{
            borderBottom: '1px solid var(--pk-color-border-default)',
            paddingBottom: '0.5rem',
            marginBottom: '1rem',
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
            <div>
              <span className="pk-badge pk-badge--verified" style={{ fontSize: '0.7rem' }}>
                Administrator Access
              </span>
              <h2 style={{ fontSize: '1.05rem', margin: '0.25rem 0 0.1rem 0', fontWeight: 700 }}>
                Admin Credentials & Contact
              </h2>
            </div>
            {!currentUser?.signedIn && (
              <Link
                href="/sign-in?next=/corporate/onboarding"
                className="pk-link"
                style={{ fontSize: '0.8rem' }}
              >
                Already have an account? Sign in
              </Link>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
            This administrator manages employee subsidies, cost centers, and billing.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {currentUser?.signedIn ? (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: '#10B981',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  ● Active Authenticated Session
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{currentUser.email}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
                  Corporate account will be provisioned under your current administrator
                  credentials.
                </div>
              </div>
              <Link
                href="/sign-in?next=/corporate/onboarding"
                className="pk-link"
                style={{ fontSize: '0.8rem' }}
              >
                Switch Account
              </Link>
            </div>
          ) : (
            <>
              {/* Google Workspace SSO Button */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={googleLoading}
                className="pk-button pk-button--secondary"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.625rem',
                  padding: '0.7rem',
                  cursor: googleLoading ? 'wait' : 'pointer',
                }}
              >
                <GoogleIcon size={18} />
                <span>
                  {googleLoading ? 'Connecting to Google…' : 'Continue with Google Workspace'}
                </span>
              </button>

              {googleError && (
                <p
                  className="pk-notice pk-notice--error"
                  style={{ margin: '0.25rem 0', fontSize: '0.8rem' }}
                >
                  {googleError}
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--pk-color-text-muted)',
                  fontSize: '0.78rem',
                }}
              >
                <div
                  style={{ flex: 1, height: '1px', background: 'var(--pk-color-border-default)' }}
                />
                <span>or create work email credentials</span>
                <div
                  style={{ flex: 1, height: '1px', background: 'var(--pk-color-border-default)' }}
                />
              </div>

              {/* Work Email Address */}
              <div>
                <label className="pk-label" htmlFor="corp-admin-email">
                  Work Email Address *
                </label>
                <input
                  id="corp-admin-email"
                  type="email"
                  className="pk-input"
                  placeholder="e.g. alex@zenithbank.com"
                  value={fields.primaryContactEmail}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  required
                />
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--pk-color-text-muted)',
                    marginTop: '0.2rem',
                    display: 'block',
                  }}
                >
                  Use your official work email. This will be your admin login.
                </span>
              </div>

              {/* Password & Confirm Password (Grouped right below Work Email!) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <label className="pk-label" htmlFor="corp-password">
                    Create Admin Password *
                  </label>
                  <input
                    id="corp-password"
                    type="password"
                    className="pk-input"
                    placeholder="At least 8 characters"
                    value={fields.password ?? ''}
                    onChange={(e) => setField('password', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="pk-label" htmlFor="corp-confirm-password">
                    Confirm Password *
                  </label>
                  <input
                    id="corp-confirm-password"
                    type="password"
                    className="pk-input"
                    placeholder="Re-enter password"
                    value={fields.confirmPassword ?? ''}
                    onChange={(e) => setField('confirmPassword', e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          {/* Primary Contact Person Details */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div>
              <label className="pk-label" htmlFor="corp-admin-name">
                Primary Contact Full Name *
              </label>
              <input
                id="corp-admin-name"
                className="pk-input"
                placeholder="e.g. Ebube Okafor"
                value={fields.primaryContactName}
                onChange={(e) => setField('primaryContactName', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="pk-label" htmlFor="corp-admin-phone">
                Contact Phone Number *
              </label>
              <input
                id="corp-admin-phone"
                className="pk-input"
                placeholder="e.g. +234 803 000 0000"
                value={fields.primaryContactPhone}
                onChange={(e) => setField('primaryContactPhone', e.target.value)}
                required
              />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation CTA */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="pk-button pk-button--primary"
          style={{ padding: '0.75rem 1.75rem', fontWeight: 600 }}
          onClick={onContinue}
        >
          Continue to Brand Customization →
        </button>
      </div>
    </div>
  );
}
