import { Text } from '@parkly/ui';
import Link from 'next/link';
import type { ResolvedTenant } from '../data/corporate-tenant';

export function CorporateCostCenters({ tenant, slug }: { tenant: ResolvedTenant; slug: string }) {
  const tenantKey = slug.toLowerCase();

  return (
    <>
      {/* Department Cost Centers */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <Text variant="heading-md" as="h2">
              Department Cost Centers
            </Text>
            <Text variant="body-sm" tone="secondary">
              Allocated monthly budgets and active parking quotas per organizational unit.
            </Text>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
            {tenant.costCenters.length} Cost Centers Configured
          </span>
        </div>

        <div className="pk-stat-grid">
          {tenant.costCenters.map((cc) => (
            <div key={cc.code} className="pk-stat-card">
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span className="pk-code" style={{ fontSize: '0.75rem' }}>
                    {cc.code}
                  </span>
                  <span className="pk-badge pk-badge--live" style={{ fontSize: '0.65rem' }}>
                    Active
                  </span>
                </div>
                <strong
                  style={{
                    fontSize: '0.95rem',
                    color: 'var(--pk-color-text-primary)',
                    display: 'block',
                  }}
                >
                  {cc.name}
                </strong>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--pk-color-text-secondary)',
                    marginTop: '0.35rem',
                  }}
                >
                  Monthly Budget:{' '}
                  <strong style={{ color: 'var(--pk-color-text-primary)' }}>{cc.budget}</strong>
                </div>
              </div>
              <div
                style={{
                  paddingTop: '0.5rem',
                  borderTop: '1px solid var(--pk-color-border-default)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>Subsidized Passes</span>
                <strong style={{ color: 'var(--pk-color-text-brand)' }}>
                  {cc.activePasses} passes
                </strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Switch Demo Tenant Quick Links */}
      <div
        className="pk-card"
        style={{
          padding: '1rem 1.25rem',
          background: 'var(--pk-color-bg-surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.85rem',
        }}
      >
        <span style={{ color: 'var(--pk-color-text-secondary)' }}>
          Preview Other Verified Corporate Tenants:
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link
            href="/corp/zenith"
            className={`pk-button pk-button--sm ${tenantKey === 'zenith' ? 'pk-button--primary' : 'pk-button--secondary'}`}
            style={{ textDecoration: 'none' }}
          >
            Zenith Bank
          </Link>
          <Link
            href="/corp/kpmg"
            className={`pk-button pk-button--sm ${tenantKey === 'kpmg' ? 'pk-button--primary' : 'pk-button--secondary'}`}
            style={{ textDecoration: 'none' }}
          >
            KPMG Nigeria
          </Link>
          <Link
            href="/corp/dangote"
            className={`pk-button pk-button--sm ${tenantKey === 'dangote' ? 'pk-button--primary' : 'pk-button--secondary'}`}
            style={{ textDecoration: 'none' }}
          >
            Dangote Group
          </Link>
        </div>
      </div>
    </>
  );
}
