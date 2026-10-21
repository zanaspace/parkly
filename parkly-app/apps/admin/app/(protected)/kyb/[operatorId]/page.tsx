import type { AdminOperatorDetail } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KybReviewForm, OpenDocumentButton } from '../../../../components/kyb-review';
import { apiFetch, ApiProblem } from '../../../../lib/api';
import { requireAccess } from '../../../../lib/auth/session';
import { publicEnv } from '../../../../lib/env';

export const metadata = { title: 'Review KYB · Parkly Admin' };

const DOC_LABELS: Record<string, string> = {
  CAC_CERT: 'CAC certificate',
  DIRECTOR_ID: 'Director ID',
  UTILITY_BILL: 'Proof of address',
  OTHER: 'Other',
};

/** X-05 detail: everything needed to decide, then approve or reject. Viewing is audited. */
export default async function KybReviewPage({
  params,
}: {
  params: Promise<{ operatorId: string }>;
}) {
  const { accessToken } = await requireAccess();
  const { operatorId } = await params;
  let detail: AdminOperatorDetail;
  try {
    detail = await apiFetch<AdminOperatorDetail>(
      publicEnv().apiUrl,
      `/v1/admin/operators/${encodeURIComponent(operatorId)}`,
      accessToken,
    );
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const { operator: op, documents, payoutAccount: bank, owner } = detail;
  const ownerName = owner ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') : '';
  const rows: [string, string | null][] = [
    ['Registered name', op.legalName],
    ['Trading name', op.tradingName],
    ['Type', op.type],
    ['CAC number', op.cacNumber],
    ['TIN', op.tin],
    ['Address', op.addressLine],
    ['Contact email', op.contactEmail],
    ['Contact phone', op.contactPhone],
    ['Owner', ownerName || null],
    ['Commission', `${op.commissionBps / 100}%`],
    ['KYB status', op.kybStatus],
  ];

  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-link" href="/kyb">
        ← KYB to review
      </Link>
      <Text variant="heading-xl">{op.legalName}</Text>
      <Text variant="body-sm" tone="tertiary">
        Your view of this record is logged in the audit trail.
      </Text>

      <table className="pk-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Text variant="heading-md" as="h2">
        Documents
      </Text>
      <ul className="pk-list">
        {documents.map((d) => (
          <li key={d.id} className="pk-row">
            <Text>
              {DOC_LABELS[d.type] ?? d.type} · {d.mime === 'application/pdf' ? 'PDF' : 'Image'}
            </Text>
            <OpenDocumentButton operatorId={op.id} documentId={d.id} />
          </li>
        ))}
      </ul>

      <Text variant="heading-md" as="h2">
        Bank account
      </Text>
      {bank ? (
        <>
          <Text>
            {bank.accountName} · {bank.bankName} · ••••{bank.accountNumberLast4}
          </Text>
          {!bank.nameMatchesLegalName && (
            <p className="pk-notice pk-notice--error" role="alert">
              The account name differs from the registered business name. Check that this account
              belongs to the business before approving.
            </p>
          )}
        </>
      ) : (
        <Text tone="secondary">No bank account.</Text>
      )}

      {op.kybStatus === 'SUBMITTED' ? (
        <KybReviewForm operatorId={op.id} />
      ) : (
        <Text tone="secondary">
          This KYB is {op.kybStatus.toLowerCase()}; there is nothing to decide.
        </Text>
      )}
    </main>
  );
}
