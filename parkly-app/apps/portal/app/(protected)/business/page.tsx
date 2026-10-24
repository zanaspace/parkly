import type { Operator } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { BuildingIcon, ShieldCheckIcon, TeamIcon } from '../../../components/icons';
import { BusinessForm } from '../../../components/operator-forms';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Business Profile · Parkly for Operators' };

const EDITABLE = new Set(['NOT_STARTED', 'REJECTED']);

const STATUS_BADGE: Record<Operator['kybStatus'], { label: string; class: string }> = {
  NOT_STARTED: { label: 'Action Needed', class: 'pk-badge--submitted' },
  SUBMITTED: { label: 'In Review', class: 'pk-badge--submitted' },
  APPROVED: { label: 'Verified Entity', class: 'pk-badge--verified' },
  REJECTED: { label: 'Needs Changes', class: 'pk-badge--rejected' },
};

export default async function BusinessPage() {
  const { me, accessToken } = await requireAccess();
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  const operatorId = grant?.operatorId;
  if (!operatorId) return null;
  const operator = await apiFetch<Operator>(
    publicEnv().apiUrl,
    `/v1/operators/${operatorId}`,
    accessToken,
  );
  const isOwner = grant.role === 'OPERATOR_OWNER';
  const locked = !EDITABLE.has(operator.kybStatus);
  const badge = STATUS_BADGE[operator.kybStatus] ?? STATUS_BADGE.NOT_STARTED;

  return (
    <main className="pk-page pk-page--wide">
      {/* Header section matching wide layout */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid var(--pk-color-border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <BuildingIcon size={22} style={{ color: 'var(--pk-color-text-brand)' }} />
            <Text variant="heading-xl">Business Profile & Trading Details</Text>
          </div>
          <Text variant="body-sm" tone="secondary">
            Manage your registered company name, trading identity, and official contact details.
          </Text>
        </div>
        <span className={`pk-badge ${badge.class}`} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
          {badge.label}
        </span>
      </div>

      {!isOwner && (
        <p className="pk-notice pk-notice--info" role="status">
          ℹ️ Only the account owner can modify business identity and registered CAC details.
        </p>
      )}
      {isOwner && locked && (
        <p className="pk-notice pk-notice--info" role="status">
          ℹ️ Legal entity details are locked while your KYB review is completed or approved. Contact support to request amendments.
        </p>
      )}

      {/* Gold-Standard 2-Column Responsive Workspace */}
      <div className="pk-business-grid">
        {/* Left Column: Comprehensive Business Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="pk-card" style={{ padding: '2rem', gap: '1.5rem' }}>
            <div>
              <Text variant="heading-md" as="h2">
                Company Information
              </Text>
              <Text variant="body-sm" tone="secondary" style={{ marginTop: '0.25rem', display: 'block' }}>
                Ensure your registered legal name matches your CAC incorporation certificate.
              </Text>
            </div>
            <BusinessForm mode="edit" operator={operator} readOnly={!isOwner || locked} />
          </div>
        </div>

        {/* Right Column: Context & Supporting Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Verification Status Card */}
          <div className="pk-card" style={{ padding: '1.75rem', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheckIcon size={20} style={{ color: 'var(--pk-color-text-brand)' }} />
              <Text variant="label-lg" as="h3">
                KYB Verification Status
              </Text>
            </div>
            <Text variant="body-sm" tone="secondary" style={{ lineHeight: 1.5 }}>
              Your business verification determines your payout account authorization and settlement schedule.
            </Text>
            <div>
              <Link href="/kyb" className="pk-button pk-button--secondary pk-button--sm">
                View KYB Documents & Bank Account →
              </Link>
            </div>
          </div>

          {/* Account Identifier Card */}
          <div
            style={{
              padding: '1.5rem',
              borderRadius: 'var(--pk-radius-md)',
              border: '1px solid var(--pk-color-border-subtle)',
              backgroundColor: 'var(--pk-color-bg-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <Text variant="label-sm" tone="tertiary">
              OPERATOR IDENTIFIER
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <code className="pk-code" style={{ fontSize: '0.85rem' }}>{operator.id}</code>
              <Text variant="caption" tone="secondary">
                Reference this identifier when submitting support tickets or configuring webhooks.
              </Text>
            </div>
          </div>

          {/* Attendant Operations Link */}
          <div className="pk-card" style={{ padding: '1.75rem', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TeamIcon size={20} style={{ color: 'var(--pk-color-text-brand)' }} />
              <Text variant="label-lg" as="h3">
                Attendant Phones & Staff
              </Text>
            </div>
            <Text variant="body-sm" tone="secondary" style={{ lineHeight: 1.5 }}>
              Assign staff members and approve attendant phones to scan booking tickets at your lots.
            </Text>
            <div>
              <Link href="/team" className="pk-button pk-button--ghost pk-button--sm">
                Manage Staff & Attendants →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
