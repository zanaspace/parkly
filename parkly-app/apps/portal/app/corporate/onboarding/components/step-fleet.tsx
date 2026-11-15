'use client';

import { CheckCircleIcon } from '../../../../components/icons';
import type { OnboardingFormFields } from '../data/onboarding-api';

type StepFleetProps = {
  fields: OnboardingFormFields;
  busy: boolean;
  setField: <K extends keyof OnboardingFormFields>(key: K, value: OnboardingFormFields[K]) => void;
  onBack: () => void;
};

export function StepFleet({ fields, busy, setField, onBack }: StepFleetProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="pk-field">
        <label className="pk-field__label" htmlFor="corp-domain">
          Authorized Employee Email Domain *
        </label>
        <div className="pk-input-group">
          <span className="pk-input-group__prefix">@</span>
          <input
            id="corp-domain"
            className="pk-input-group__input"
            placeholder="e.g. zenithbank.com"
            value={fields.emailDomain}
            onChange={(e) =>
              setField('emailDomain', e.target.value.toLowerCase().replace(/^@/, ''))
            }
            required
          />
        </div>
        <div className="pk-subdomain-hint">
          Any staff signing into Parkly with this email domain will automatically link to your
          corporate account.
        </div>
      </div>

      <div className="pk-form-grid-2">
        <div className="pk-field">
          <label className="pk-field__label" htmlFor="corp-cc-code">
            Cost Center Code
          </label>
          <input
            id="corp-cc-code"
            className="pk-input"
            placeholder="e.g. HQ-CORP-01"
            value={fields.costCenterCode}
            onChange={(e) => setField('costCenterCode', e.target.value)}
          />
        </div>
        <div className="pk-field">
          <label className="pk-field__label" htmlFor="corp-cc-name">
            Department Name
          </label>
          <input
            id="corp-cc-name"
            className="pk-input"
            placeholder="e.g. Headquarters Operations"
            value={fields.costCenterName}
            onChange={(e) => setField('costCenterName', e.target.value)}
          />
        </div>
      </div>

      <div className="pk-field">
        <label className="pk-field__label" htmlFor="corp-budget">
          Initial Monthly Budget (₦)
        </label>
        <div className="pk-input-group">
          <span className="pk-input-group__prefix">₦</span>
          <input
            id="corp-budget"
            type="number"
            className="pk-input-group__input"
            placeholder="500000"
            value={Math.round(parseInt(fields.monthlyBudgetKobo || '0', 10) / 100)}
            onChange={(e) =>
              setField('monthlyBudgetKobo', (parseInt(e.target.value || '0', 10) * 100).toString())
            }
          />
        </div>
      </div>

      <div
        className="pk-card"
        style={{
          background: 'var(--pk-color-bg-canvas)',
          padding: '1rem',
          border: '1px solid var(--pk-color-border-default)',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircleIcon size={18} style={{ color: '#10B981', flexShrink: 0 }} />
          <strong style={{ fontSize: '0.85rem' }}>Consolidated Net-30 Invoicing Included</strong>
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--pk-color-text-secondary)',
            marginTop: '0.25rem',
          }}
        >
          Your enterprise account receives itemized monthly billing. No employee expense receipts or
          credit cards required.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <button type="button" className="pk-button pk-button--secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          type="submit"
          disabled={busy}
          className="pk-button pk-button--primary pk-button--lg"
          style={{
            backgroundColor: fields.primaryColor,
            borderColor: fields.primaryColor,
            padding: '0.75rem 1.5rem',
            fontWeight: 600,
          }}
        >
          {busy ? 'Activating Subdomain...' : 'Activate Corporate Tenant & Subdomain →'}
        </button>
      </div>
    </div>
  );
}
