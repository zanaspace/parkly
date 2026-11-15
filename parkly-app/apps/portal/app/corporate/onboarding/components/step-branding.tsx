'use client';

import { PRESET_COLORS, type OnboardingFormFields } from '../data/onboarding-api';

type StepBrandingProps = {
  fields: OnboardingFormFields;
  setField: <K extends keyof OnboardingFormFields>(key: K, value: OnboardingFormFields[K]) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function StepBranding({ fields, setField, onBack, onContinue }: StepBrandingProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="pk-field">
        <label className="pk-field__label">Corporate Primary Theme Color</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setField('primaryColor', c.hex)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border:
                  fields.primaryColor === c.hex
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
            value={fields.primaryColor}
            onChange={(e) => setField('primaryColor', e.target.value)}
            style={{
              width: '42px',
              height: '38px',
              borderRadius: '6px',
              border: '1px solid var(--pk-color-border-default)',
              padding: '2px',
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
          <input
            className="pk-input"
            value={fields.primaryColor}
            onChange={(e) => setField('primaryColor', e.target.value)}
            style={{ width: '140px', fontFamily: 'monospace' }}
          />
        </div>
      </div>

      <div className="pk-field">
        <label className="pk-field__label" htmlFor="corp-portalTitle">
          Portal Title *
        </label>
        <input
          id="corp-portalTitle"
          className="pk-input"
          placeholder="e.g. Zenith Bank Workplace Mobility"
          value={fields.portalTitle}
          onChange={(e) => setField('portalTitle', e.target.value)}
          required
        />
      </div>

      <div className="pk-field">
        <label className="pk-field__label" htmlFor="corp-welcome">
          Portal Welcome Banner Note
        </label>
        <textarea
          id="corp-welcome"
          className="pk-input"
          rows={3}
          placeholder="e.g. Authorized staff and fleet parking for Zenith Bank branches and headquarters."
          value={fields.welcomeMessage}
          onChange={(e) => setField('welcomeMessage', e.target.value)}
          style={{ height: 'auto', minHeight: '80px', padding: '0.625rem 0.875rem' }}
        />
      </div>

      <div className="pk-field">
        <label className="pk-field__label" htmlFor="corp-logo">
          Logo Image URL (Optional)
        </label>
        <input
          id="corp-logo"
          className="pk-input"
          placeholder="https://... (SVG, PNG, or WebP logo)"
          value={fields.logoUrl}
          onChange={(e) => setField('logoUrl', e.target.value)}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <button type="button" className="pk-button pk-button--secondary" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="pk-button pk-button--primary" onClick={onContinue}>
          Continue to Domains & Fleet →
        </button>
      </div>
    </div>
  );
}
