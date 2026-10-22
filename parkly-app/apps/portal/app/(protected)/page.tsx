import type { Occupancy, Operator, TeamMember } from '@parkly/contracts';
import Link from 'next/link';
import { Text } from '@parkly/ui';
import { apiFetch } from '../../lib/api';
import { requireAccess } from '../../lib/auth/session';
import { publicEnv } from '../../lib/env';
import { ROLE_LABEL } from '../../lib/team/copy';

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
  const [operator, members, occupancy] = operatorId
    ? await Promise.all([
        apiFetch<Operator>(publicEnv().apiUrl, `/v1/operators/${operatorId}`, accessToken),
        apiFetch<{ items: TeamMember[] }>(
          publicEnv().apiUrl,
          `/v1/operators/${operatorId}/members`,
          accessToken,
        ).then((r) => r.items),
        apiFetch<Occupancy>(
          publicEnv().apiUrl,
          `/v1/operators/${operatorId}/occupancy`,
          accessToken,
        )
          .then((r) => r.items)
          .catch(() => []),
      ])
    : [null, [], []];
  const invited = members.filter((m) => m.status === 'INVITED').length;

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

      {occupancy.length > 0 && (
        <>
          <Text variant="heading-md" as="h2">
            Right now
          </Text>
          <div className="pk-table-wrap">
            <table className="pk-table">
              <thead>
                <tr>
                  <th scope="col">Lot</th>
                  <th scope="col">Parked (Parkly)</th>
                  <th scope="col">Walk-ins</th>
                  <th scope="col">Expected (24 h)</th>
                  <th scope="col">Spaces</th>
                </tr>
              </thead>
              <tbody>
                {occupancy.map((o) => (
                  <tr key={o.lotId}>
                    <td>{o.name}</td>
                    <td>{o.parked}</td>
                    <td>{o.walkIns}</td>
                    <td>{o.expected}</td>
                    <td>
                      {Math.max(0, o.capacityTotal - o.parked - o.walkIns)} free of{' '}
                      {o.capacityTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a className="pk-link" href="/attend">
            Open the gate app (check cars in and out)
          </a>
        </>
      )}

      <Text variant="heading-md" as="h2">
        Team
      </Text>
      <Text tone="secondary">
        {members
          .filter((m) => m.status === 'ACTIVE')
          .map((m) => `${m.name ?? 'Member'} (${ROLE_LABEL[m.role]})`)
          .join(', ')}
        {invited > 0 ? ` · ${invited} invited` : ''}
      </Text>
      <Link className="pk-link" href="/team">
        Manage team and invites
      </Link>
    </main>
  );
}
