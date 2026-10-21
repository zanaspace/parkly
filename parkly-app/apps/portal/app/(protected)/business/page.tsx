import type { Operator } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { BusinessForm } from '../../../components/operator-forms';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';

export const metadata = { title: 'Business details · Parkly for Operators' };

const EDITABLE = new Set(['NOT_STARTED', 'REJECTED']);

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

  return (
    <main className="pk-page">
      <Link className="pk-link" href="/">
        ← Back
      </Link>
      <Text variant="heading-xl">Business details</Text>
      {!isOwner && <Text tone="secondary">Only the account owner can change these details.</Text>}
      {isOwner && locked && (
        <Text tone="secondary">These details are locked while your KYB is being reviewed.</Text>
      )}
      <BusinessForm mode="edit" operator={operator} readOnly={!isOwner || locked} />
    </main>
  );
}
