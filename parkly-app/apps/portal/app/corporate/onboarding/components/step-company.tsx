'use client';

import { Select } from '@parkly/ui';
import Link from 'next/link';
import { GoogleIcon } from '../../../../components/icons';
import { signInWithGoogle } from '../../../../lib/auth/actions';
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 1. Admin Authentication Box */}
      {currentUser?.signedIn ? (
        <div
          className="pk-card"
          style={{
            background: 'rgba(16, 185, 129, 0.06)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '0.875rem 1rem',
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
              ● Authenticated Corporate Administrator
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{currentUser.email}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
              This corporate organization will be linked to your existing Parkly credentials.
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
        <div
          className="pk-card"
          style={{
            background: 'var(--pk-color-bg-canvas)',
            padding: '1rem',
            border: '1px solid var(--pk-color-border-default)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <strong style={{ fontSize: '0.85rem' }}>Administrator Account & Sign-In</strong>
            <Link
              href="/sign-in?next=/corporate/onboarding"
              className="pk-link"
              style={{ fontSize: '0.8rem' }}
            >
              Already have an account? Sign In
            </Link>
          </div>

          <form action={() => signInWithGoogle('/corporate/onboarding')}>
            <button
              type="submit"
              className="pk-button pk-button--secondary"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <GoogleIcon size={18} />
              <span>Continue with Google Workspace</span>
            </button>
          </form>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              margin: '0.5rem 0',
              color: 'var(--pk-color-text-muted)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ flex: 1, height: '1px', background: 'var(--pk-color-border-subtle)' }} />
            <span>or sign up with work email and password</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--pk-color-border-subtle)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="pk-label" htmlFor="corp-password">
                Admin Password *
              </label>
              <input
                id="corp-password"
                type="password"
                className="pk-input"
                placeholder="At least 8 characters"
                value={fields.password ?? ''}
                onChange={(e) => setField('password', e.target.value)}
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
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Company Details */}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
          Choose Your Dedicated Subdomain *
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
          {urlInfo.isStagingOrDev ? (
            <>
              Active Preview URL: <strong>{urlInfo.activeUrl}</strong>
              <div style={{ color: 'var(--pk-color-text-muted)', marginTop: '0.15rem' }}>
                Production Subdomain Target: {urlInfo.productionUrl}
              </div>
            </>
          ) : (
            <>
              Your sovereign URL: <strong>{urlInfo.activeUrl}</strong>
            </>
          )}
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

      <div>
        <label className="pk-label" htmlFor="corp-admin-name">
          Primary Contact Name *
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
            value={fields.primaryContactEmail}
            onChange={(e) => setField('primaryContactEmail', e.target.value)}
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
            value={fields.primaryContactPhone}
            onChange={(e) => setField('primaryContactPhone', e.target.value)}
            required
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button type="button" className="pk-button pk-button--primary" onClick={onContinue}>
          Continue to Brand Customization →
        </button>
      </div>
    </div>
  );
}
