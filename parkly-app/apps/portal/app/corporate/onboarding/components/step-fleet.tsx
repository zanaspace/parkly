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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="pk-label" htmlFor="corp-domain">
          Authorized Employee Email Domain *
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--pk-color-text-secondary)' }}>@</span>
          <input
            id="corp-domain"
            className="pk-input"
            placeholder="e.g. zenithbank.com"
            value={fields.emailDomain}
            onChange={(e) =>
              setField('emailDomain', e.target.value.toLowerCase().replace(/^@/, ''))
            }
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
          Any staff signing into Parkly with this email domain will automatically link to your
          corporate account!
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
            value={fields.costCenterCode}
            onChange={(e) => setField('costCenterCode', e.target.value)}
          />
        </div>
        <div>
          <label className="pk-label" htmlFor="corp-cc-name">
            Department Name
          </label>
          <input
            id="corp-cc-name"
            className="pk-input"
            value={fields.costCenterName}
            onChange={(e) => setField('costCenterName', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="pk-label">Initial Monthly Budget (₦)</label>
        <input
          type="number"
          className="pk-input"
          value={Math.round(parseInt(fields.monthlyBudgetKobo || '0', 10) / 100)}
          onChange={(e) =>
            setField('monthlyBudgetKobo', (parseInt(e.target.value || '0', 10) * 100).toString())
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

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}>
        <button type="button" className="pk-button pk-button--secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          type="submit"
          disabled={busy}
          className="pk-button pk-button--primary pk-button--lg"
          style={{ backgroundColor: fields.primaryColor, borderColor: fields.primaryColor }}
        >
          {busy ? 'Activating Subdomain...' : 'Activate Corporate Tenant & Subdomain →'}
        </button>
      </div>
    </div>
  );
}
