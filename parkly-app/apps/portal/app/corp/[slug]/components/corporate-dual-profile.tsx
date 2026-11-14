import { Text } from '@parkly/ui';
import { CheckCircleIcon, TeamIcon } from '../../../../components/icons';
import type { ResolvedTenant } from '../data/corporate-tenant';

export function CorporateDualProfile({ tenant }: { tenant: ResolvedTenant }) {
  return (
    <div
      className="pk-card"
      style={{
        padding: '1.5rem',
        background: 'var(--pk-color-bg-surface)',
        border: '1px solid var(--pk-color-border-default)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TeamIcon size={20} />
          <strong style={{ fontSize: '1rem', color: 'var(--pk-color-text-primary)' }}>
            Seamless Dual-Profile Driver Linking
          </strong>
        </div>
        <span className="pk-badge pk-badge--verified">
          1 Account · 2 Profiles (Personal + Corporate)
        </span>
      </div>

      <Text variant="body-md" tone="secondary" style={{ lineHeight: 1.5 }}>
        Are you a {tenant.legalName} employee who already uses the Parkly Driver mobile app for
        personal parking? You <strong>do not need to create a second account</strong> or download
        another app. Simply add your corporate email (
        <code className="pk-code">name@{tenant.emailDomain}</code>) in your mobile profile, and your
        existing account will instantly link to your company’s parking subsidy with a 1-tap profile
        switcher.
      </Text>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginTop: '0.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--pk-color-border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <CheckCircleIcon
            size={18}
            style={{ color: 'var(--pk-color-text-brand)', marginTop: '2px' }}
          />
          <div>
            <strong style={{ fontSize: '0.85rem', display: 'block' }}>
              Step 1: Open Mobile Profile
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
              Go to Account → Work Email in Parkly app
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <CheckCircleIcon
            size={18}
            style={{ color: 'var(--pk-color-text-brand)', marginTop: '2px' }}
          />
          <div>
            <strong style={{ fontSize: '0.85rem', display: 'block' }}>
              Step 2: Verify Work Email
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
              Enter @{tenant.emailDomain} and verify 6-digit OTP
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <CheckCircleIcon
            size={18}
            style={{ color: 'var(--pk-color-text-brand)', marginTop: '2px' }}
          />
          <div>
            <strong style={{ fontSize: '0.85rem', display: 'block' }}>
              Step 3: Switch Profiles
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
              Toggle between Personal & Corporate at checkout
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
