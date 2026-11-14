import { Text } from '@parkly/ui';
import Link from 'next/link';
import type { ResolvedTenant } from '../data/corporate-tenant';

export function CorporateHero({ tenant }: { tenant: ResolvedTenant }) {
  return (
    <div
      className="pk-card"
      style={{
        borderLeft: `4px solid ${tenant.primaryColor}`,
        padding: '1.75rem',
        background: 'var(--pk-color-bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              marginBottom: '0.5rem',
            }}
          >
            <span className="pk-badge pk-badge--live">● Enterprise Active</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
              {tenant.industry}
            </span>
          </div>
          <Text variant="heading-xl">{tenant.legalName}</Text>
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ marginTop: '0.35rem', maxWidth: '640px', display: 'block' }}
          >
            Dedicated employer transit portal for employee pass subsidies, corporate department cost
            centers, and consolidated Net-30 monthly invoicing.
          </Text>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/sign-in"
            className="pk-button pk-button--primary"
            style={{
              backgroundColor: tenant.primaryColor,
              borderColor: tenant.primaryColor,
              textDecoration: 'none',
            }}
          >
            Employee Single Sign-On
          </Link>
          <Link
            href="/onboarding"
            className="pk-button pk-button--secondary"
            style={{ textDecoration: 'none' }}
          >
            Admin Console
          </Link>
        </div>
      </div>
    </div>
  );
}
