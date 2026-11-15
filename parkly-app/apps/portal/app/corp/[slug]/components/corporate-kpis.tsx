import { Text } from '@parkly/ui';
import {
  BanknoteIcon,
  BuildingIcon,
  LotsIcon,
  ShieldCheckIcon,
} from '../../../../components/icons';
import { getTenantUrl } from '../../../../lib/tenant-url';
import type { ResolvedTenant } from '../data/corporate-tenant';

export function CorporateKpis({ tenant, slug }: { tenant: ResolvedTenant; slug: string }) {
  const urlInfo = getTenantUrl(slug);

  return (
    <div className="pk-stat-grid">
      {/* Dedicated Subdomain */}
      <div className="pk-stat-card">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              color: 'var(--pk-color-text-brand)',
            }}
          >
            <BuildingIcon size={18} />
            <Text variant="label-lg" tone="brand">
              Dedicated URL
            </Text>
          </div>
          <div
            className="pk-stat-count"
            style={{
              fontSize: urlInfo.isStagingOrDev ? '1.05rem' : '1.35rem',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
          >
            {urlInfo.displayUrl}
          </div>
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ marginTop: '0.5rem', display: 'block' }}
          >
            {urlInfo.isStagingOrDev
              ? `Active portal address (Target: ${urlInfo.productionUrl})`
              : 'Sovereign edge-routed corporate tenant address.'}
          </Text>
        </div>
      </div>

      {/* Verified Email Domain */}
      <div className="pk-stat-card">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              color: 'var(--pk-color-text-brand)',
            }}
          >
            <ShieldCheckIcon size={18} />
            <Text variant="label-lg" tone="brand">
              Email Domain
            </Text>
          </div>
          <div
            className="pk-stat-count"
            style={{
              fontSize: '1.35rem',
              color: 'var(--pk-color-text-brand)',
              fontFamily: 'monospace',
            }}
          >
            @{tenant.emailDomain}
          </div>
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ marginTop: '0.5rem', display: 'block' }}
          >
            Automatic employee verification via domain SSO.
          </Text>
        </div>
      </div>

      {/* Active Employee Passes */}
      <div className="pk-stat-card">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              color: 'var(--pk-color-text-brand)',
            }}
          >
            <LotsIcon size={18} />
            <Text variant="label-lg" tone="brand">
              Active Passes
            </Text>
          </div>
          <div className="pk-stat-count">{tenant.totalPasses}</div>
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ marginTop: '0.5rem', display: 'block' }}
          >
            Monthly parking passes allocated across lots.
          </Text>
        </div>
      </div>

      {/* Consolidated Invoicing */}
      <div className="pk-stat-card">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              color: 'var(--pk-color-text-brand)',
            }}
          >
            <BanknoteIcon size={18} />
            <Text variant="label-lg" tone="brand">
              Billing
            </Text>
          </div>
          <div className="pk-stat-count" style={{ fontSize: '1.25rem' }}>
            Net-30 Monthly
          </div>
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ marginTop: '0.5rem', display: 'block' }}
          >
            Single itemized invoice with zero employee expense reports.
          </Text>
        </div>
      </div>
    </div>
  );
}
