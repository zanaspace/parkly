import type { Bank, KybDocument, Operator, PayoutAccount } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { DocumentSlot, PayoutForm, SubmitKyb } from '../../../components/kyb';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { DOCUMENT_LABELS, REQUIRED_DOCUMENTS } from '../../../lib/operators/kyb-copy';

export const metadata = { title: 'Verification (KYB) · Parkly for Operators' };

const EDITABLE = new Set(['NOT_STARTED', 'REJECTED']);
const STATUS_TEXT: Record<Operator['kybStatus'], string> = {
  NOT_STARTED: 'Add your documents and bank account, then submit for review.',
  SUBMITTED: 'Submitted. Our team reviews KYB within 3 business days; we’ll email you.',
  APPROVED: 'Approved. Your business is verified.',
  REJECTED: 'Needs changes: see the notes on your documents, fix them and submit again.',
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

  return (
    <main className="pk-page">
      <Link className="pk-link" href="/">
        ← Back
      </Link>
      <Text variant="heading-xl">Verification (KYB)</Text>
      <Text tone="secondary">{STATUS_TEXT[operator.kybStatus]}</Text>
      {operator.kybStatus === 'REJECTED' && operator.kybRejectionReason && (
        <p className="pk-notice pk-notice--error" role="alert">
          What to fix: {operator.kybRejectionReason}
        </p>
      )}
      {!isOwner && <Text tone="secondary">Only the account owner can change KYB items.</Text>}

      <Text variant="heading-md" as="h2">
        Documents
      </Text>
      <Text variant="body-sm" tone="tertiary">
        PDF, JPG or PNG, up to 10 MB each. Files are stored privately and only Parkly’s compliance
        team can view them.
      </Text>
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

      <Text variant="heading-md" as="h2">
        Payouts
      </Text>
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

      {editable && <SubmitKyb operatorId={operatorId} />}
    </main>
  );
}
