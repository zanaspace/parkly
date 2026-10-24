import type { Bank, KybDocument, Operator, PayoutAccount } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { ShieldCheckIcon } from '../../../components/icons';
import { DocumentSlot, PayoutForm, SubmitKyb } from '../../../components/kyb';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { DOCUMENT_LABELS, REQUIRED_DOCUMENTS } from '../../../lib/operators/kyb-copy';

export const metadata = { title: 'Verification (KYB) · Parkly for Operators' };

const EDITABLE = new Set(['NOT_STARTED', 'REJECTED']);
const STATUS_TEXT: Record<Operator['kybStatus'], string> = {
  NOT_STARTED: 'Add your business documents and bank account, then submit for review.',
  SUBMITTED: 'Submitted. Our compliance team reviews KYB within 3 business days; we’ll email you.',
  APPROVED: 'Approved. Your business is fully verified and authorized to accept settlements.',
  REJECTED: 'Needs changes: see the notes on your documents, fix them and submit again.',
};

const STATUS_BADGE: Record<Operator['kybStatus'], { label: string; class: string }> = {
  NOT_STARTED: { label: 'Action Needed', class: 'pk-badge--submitted' },
  SUBMITTED: { label: 'In Review', class: 'pk-badge--submitted' },
  APPROVED: { label: 'Verified', class: 'pk-badge--verified' },
  REJECTED: { label: 'Needs Changes', class: 'pk-badge--rejected' },
};

/** O-04 → O-06: KYB documents, payout account, submit for review. */
export default async function KybPage() {
  const { me, accessToken } = await requireAccess();
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  const operatorId = grant?.operatorId;
  if (!operatorId) return null;
  const api = publicEnv().apiUrl;
  const path = `/v1/operators/${operatorId}`;
  const [operator, docs, payout, banks] = await Promise.all([
    apiFetch<Operator>(api, path, accessToken),
    apiFetch<{ items: KybDocument[] }>(api, `${path}/kyb-documents`, accessToken),
    apiFetch<{ account: PayoutAccount | null }>(api, `${path}/payout-account`, accessToken),
    apiFetch<{ items: Bank[] }>(api, '/v1/banks', accessToken).catch(() => ({ items: [] })),
  ]);
  const isOwner = grant.role === 'OPERATOR_OWNER';
  const editable = isOwner && EDITABLE.has(operator.kybStatus);
  const badge = STATUS_BADGE[operator.kybStatus] ?? STATUS_BADGE.NOT_STARTED;

  return (
    <main className="pk-page pk-page--wide">
      {/* Header section matching wide layout */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--pk-color-border-subtle)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <ShieldCheckIcon size={22} style={{ color: 'var(--pk-color-text-brand)' }} />
            <Text variant="heading-xl">Business Verification (KYB)</Text>
          </div>
          <Text variant="body-sm" tone="secondary">
            {STATUS_TEXT[operator.kybStatus]}
          </Text>
        </div>
        <span className={`pk-badge ${badge.class}`} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
          {badge.label}
        </span>
      </div>

      {operator.kybStatus === 'REJECTED' && operator.kybRejectionReason && (
        <p className="pk-notice pk-notice--error" role="alert">
          What to fix: {operator.kybRejectionReason}
        </p>
      )}
      {!isOwner && <Text tone="secondary">Only the account owner can change KYB items.</Text>}

      {/* Gold-Standard 2-Column Responsive Workspace */}
      <div className="pk-kyb-grid">
        {/* Left Column: Documents */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <Text variant="heading-md" as="h2">
              Legal Documents
            </Text>
            <Text variant="body-sm" tone="secondary" style={{ marginTop: '0.25rem', display: 'block' }}>
              PDF, JPG or PNG, up to 10 MB each. Files are stored privately under NDPA encryption.
            </Text>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {REQUIRED_DOCUMENTS.map((type) => (
              <DocumentSlot
                key={type}
                operatorId={operatorId}
                type={type}
                label={DOCUMENT_LABELS[type]}
                documents={docs.items.filter((d) => d.type === type)}
                editable={editable}
              />
            ))}
          </div>
        </div>

        {/* Right Column: Settlement Account & Verification Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <Text variant="heading-md" as="h2">
              Settlement & Bank Payouts
            </Text>
            <Text variant="body-sm" tone="secondary" style={{ marginTop: '0.25rem', display: 'block' }}>
              Your Nigerian commercial bank account where parking booking revenue is settled.
            </Text>
          </div>

          <div className="pk-card" style={{ padding: '1.75rem', gap: '1rem' }}>
            {editable && banks.items.length === 0 && (
              <Text tone="secondary">
                The bank list isn’t available right now. Please try again later.
              </Text>
            )}
            <PayoutForm
              operatorId={operatorId}
              banks={banks.items}
              account={payout.account}
              editable={editable && banks.items.length > 0}
            />
          </div>

          {editable && (
            <div className="pk-card" style={{ padding: '1.75rem', gap: '1rem' }}>
              <Text variant="label-lg" tone="brand">
                Submit for Compliance Review
              </Text>
              <Text variant="body-sm" tone="secondary">
                Once submitted, Parkly’s operations team will review your CAC registration, director identity, and bank account details within 3 business days.
              </Text>
              <SubmitKyb operatorId={operatorId} />
            </div>
          )}

          {/* Compliance Assurance Card */}
          <div
            style={{
              padding: '1.5rem',
              borderRadius: 'var(--pk-radius-md)',
              border: '1px solid var(--pk-color-border-subtle)',
              backgroundColor: 'var(--pk-color-bg-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheckIcon size={18} style={{ color: 'var(--pk-color-text-brand)' }} />
              <strong style={{ fontSize: '0.875rem' }}>NDPA Compliant Data Storage</strong>
            </div>
            <Text variant="caption" tone="secondary" style={{ lineHeight: 1.5 }}>
              All identity credentials and bank subaccount records are stored in encrypted, append-only vaults under Nigerian Data Protection Act (NDPA) regulations.
            </Text>
          </div>
        </div>
      </div>
    </main>
  );
}
