import type { OperatorMember } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { apiFetch } from '../../lib/api';
import { requireAccess } from '../../lib/auth/session';
import { publicEnv } from '../../lib/env';

const ROLE_LABEL: Record<string, string> = {
  OPERATOR_OWNER: 'Owner',
  OPERATOR_MANAGER: 'Manager',
  OPERATOR_ATTENDANT: 'Attendant',
};

export default async function PortalHome() {
  const { me, accessToken } = await requireAccess();
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  const operatorId = grant?.operatorId ?? null;
  const members = operatorId
    ? (
        await apiFetch<{ items: OperatorMember[] }>(
          publicEnv().apiUrl,
          `/v1/operators/${operatorId}/members`,
          accessToken,
        )
      ).items
    : [];

  return (
    <main className="pk-page pk-page--wide">
      <Text variant="heading-xl">Welcome{me.firstName ? `, ${me.firstName}` : ''}</Text>
      <Text tone="secondary">
        Lots, permits and verification arrive next sprint. For now you can see who has access to
        your operator account.
      </Text>

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
