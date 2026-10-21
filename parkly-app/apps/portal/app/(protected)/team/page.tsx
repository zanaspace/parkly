import type { LotSummary, Operator, TeamMember } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { InviteForm, RemoveMemberButton } from '../../../components/team';
import { apiFetch } from '../../../lib/api';
import { requireAccess } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { ROLE_LABEL } from '../../../lib/team/copy';
import { lotOperatorId } from '../lots/operator';

export const metadata = { title: 'Team · Parkly for Operators' };

const lagos = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

/** O-20 Team (FR-OPS-004, doc 03 §2.3): members, open invites, invite and remove. */
export default async function TeamPage() {
  const { me, accessToken } = await requireAccess();
  const operatorId = lotOperatorId(me);
  if (!operatorId) return null;
  const isOwner = me.roles.some((r) => r.role === 'OPERATOR_OWNER' && r.operatorId === operatorId);
  const api = publicEnv().apiUrl;
  const base = `/v1/operators/${operatorId}`;
  const [operator, team, lots] = await Promise.all([
    apiFetch<Operator>(api, base, accessToken),
    apiFetch<{ items: TeamMember[] }>(api, `${base}/members`, accessToken),
    apiFetch<{ items: LotSummary[] }>(api, `${base}/lots`, accessToken),
  ]);
  const lotName = new Map(lots.items.map((l) => [l.id, l.name]));

  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-link" href="/">
        ← Back
      </Link>
      <Text variant="heading-xl">Team</Text>
      <div className="pk-table-wrap">
        <table className="pk-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              {isOwner && <th scope="col">Action</th>}
            </tr>
          </thead>
          <tbody>
            {team.items.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name ?? '—'}
                  {m.role === 'ATTENDANT' && (
                    <Text variant="body-sm" tone="tertiary">
                      {m.lotIds.length === 0
                        ? 'All lots'
                        : m.lotIds.map((id) => lotName.get(id) ?? 'Removed lot').join(', ')}
                    </Text>
                  )}
                </td>
                <td>{ROLE_LABEL[m.role]}</td>
                <td>
                  {m.status === 'ACTIVE'
                    ? 'Active'
                    : `Invited, link expires ${m.inviteExpiresAt ? lagos.format(new Date(m.inviteExpiresAt)) : ''}`}
                </td>
                {isOwner && (
                  <td>
                    {m.role !== 'OWNER' && (
                      <RemoveMemberButton
                        operatorId={operatorId}
                        memberId={m.id}
                        label={m.status === 'ACTIVE' ? 'Remove' : 'Cancel invite'}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text variant="body-sm" tone="tertiary">
        Removing someone signs them out of Parkly everywhere straight away.
      </Text>

      <Text variant="heading-md" as="h2">
        Invite someone
      </Text>
      <InviteForm
        operatorId={operatorId}
        businessName={operator.tradingName}
        canInviteManager={isOwner}
        lots={lots.items.map((l) => ({ id: l.id, name: l.name }))}
      />
    </main>
  );
}
