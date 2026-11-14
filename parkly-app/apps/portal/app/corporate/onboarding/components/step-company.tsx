'use client';

import { Select } from '@parkly/ui';
import { INDUSTRY_OPTIONS, type OnboardingFormFields } from '../data/onboarding-api';

type StepCompanyProps = {
  fields: OnboardingFormFields;
  setField: <K extends keyof OnboardingFormFields>(key: K, value: OnboardingFormFields[K]) => void;
  handleLegalNameChange: (val: string) => void;
  onContinue: () => void;
};

export function StepCompany({
  fields,
  setField,
  handleLegalNameChange,
  onContinue,
}: StepCompanyProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
          {/* Brand Custom Dropdown from @parkly/ui */}
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
          Your sovereign URL: <strong>https://{fields.slug || 'company'}.parkly.ng</strong>
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
