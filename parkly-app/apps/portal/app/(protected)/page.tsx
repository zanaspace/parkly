import type { Operator, OperatorMember } from '@parkly/contracts';
import Link from 'next/link';
import { Text } from '@parkly/ui';
import { apiFetch } from '../../lib/api';
import { requireAccess } from '../../lib/auth/session';
import { publicEnv } from '../../lib/env';

const ROLE_LABEL: Record<string, string> = {
  OPERATOR_OWNER: 'Owner',
  OPERATOR_MANAGER: 'Manager',
  OPERATOR_ATTENDANT: 'Attendant',
};

const KYB_LABEL: Record<Operator['kybStatus'], string> = {
  NOT_STARTED: 'not started',
  SUBMITTED: 'submitted, in review',
  APPROVED: 'approved',
  REJECTED: 'needs changes',
};

export default async function PortalHome() {
  const { me, accessToken } = await requireAccess();
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  const operatorId = grant?.operatorId ?? null;
  const [operator, members] = operatorId
    ? await Promise.all([
        apiFetch<Operator>(publicEnv().apiUrl, `/v1/operators/${operatorId}`, accessToken),
        apiFetch<{ items: OperatorMember[] }>(
          publicEnv().apiUrl,
          `/v1/operators/${operatorId}/members`,
          accessToken,
        ).then((r) => r.items),
      ])
    : [null, []];

  return (
    <main className="pk-page pk-page--wide">
      <Text variant="heading-xl">Welcome{me.firstName ? `, ${me.firstName}` : ''}</Text>
      {operator && (
        <>
          <Text variant="heading-md" as="h2">
            {operator.tradingName}
          </Text>
          <Text tone="secondary">
            {operator.legalName} · KYB: {KYB_LABEL[operator.kybStatus]}
          </Text>
          <Link className="pk-link" href="/business">
            View or edit business details
          </Link>
          <Link className="pk-link" href="/lots">
            Your lots
          </Link>
          <Link className="pk-link" href="/kyb">
            {operator.kybStatus === 'NOT_STARTED' || operator.kybStatus === 'REJECTED'
              ? 'Complete verification (KYB): documents and bank account'
              : 'View verification (KYB)'}
          </Link>
        </>
      )}

      <Text variant="heading-md" as="h2">
        Team
      </Text>
      {operatorId && (
        <Text variant="body-sm" tone="tertiary">
          Operator ID: <code className="pk-code">{operatorId}</code>
        </Text>
      )}
      <table className="pk-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={`${m.userId}-${m.role}`}>
              <td>{m.firstName ?? 'Invited user'}</td>
              <td>{ROLE_LABEL[m.role] ?? m.role}</td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr>
              <td colSpan={2}>No team members yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
