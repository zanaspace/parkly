'use client';

import { getTenantUrl } from '../../../../lib/tenant-url';
import type { OnboardingFormFields } from '../data/onboarding-api';

export function PreviewTenantCard({ fields }: { fields: OnboardingFormFields }) {
  const {
    legalName,
    portalTitle,
    welcomeMessage,
    primaryColor,
    slug,
    emailDomain,
    costCenterCode,
  } = fields;

  return (
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
              Dedicated URL
            </div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--pk-color-text-brand)',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}
            >
              {getTenantUrl(slug).displayUrl}
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
  );
}
