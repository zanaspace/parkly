import type { LotSummary, Operator, OperatorDevice, TeamMember } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import { TeamIcon } from '../../../components/icons';
import { DeviceDecisionButton, InviteForm, RemoveMemberButton } from '../../../components/team';
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
  const [operator, team, lots, devices] = await Promise.all([
    apiFetch<Operator>(api, base, accessToken),
    apiFetch<{ items: TeamMember[] }>(api, `${base}/members`, accessToken),
    apiFetch<{ items: LotSummary[] }>(api, `${base}/lots`, accessToken),
    apiFetch<{ items: OperatorDevice[] }>(api, `${base}/devices`, accessToken),
  ]);
  const lotName = new Map(lots.items.map((l) => [l.id, l.name]));

  return (
    <main className="pk-page pk-page--wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <TeamIcon size={22} style={{ color: 'var(--pk-color-text-brand)' }} />
            <Text variant="heading-xl">Staff & Attendants</Text>
          </div>
          <Text variant="body-sm" tone="secondary">
            Manage your operations team, attendants, and authorized scanning devices.
          </Text>
        </div>
        <span className="pk-badge pk-badge--verified" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
          {team.items.length} {team.items.length === 1 ? 'Member' : 'Members'}
        </span>
      </div>

      {/* Staff & Attendants: Desktop Table */}
      <div className="pk-table-desktop">
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                {isOwner && <th scope="col" style={{ textAlign: 'right' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {team.items.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name ?? '—'}</strong>
                    {m.role === 'ATTENDANT' && (
                      <Text variant="body-sm" tone="tertiary" style={{ display: 'block', marginTop: '0.2rem' }}>
                        {m.lotIds.length === 0
                          ? 'All lots'
                          : m.lotIds.map((id) => lotName.get(id) ?? 'Removed lot').join(', ')}
                      </Text>
                    )}
                  </td>
                  <td>
                    <span className="pk-badge pk-badge--draft">{ROLE_LABEL[m.role]}</span>
                  </td>
                  <td>
                    {m.status === 'ACTIVE' ? (
                      <span className="pk-badge pk-badge--verified">Active</span>
                    ) : (
                      <div>
                        <span className="pk-badge pk-badge--submitted">Invited</span>
                        <Text variant="caption" tone="tertiary" style={{ display: 'block', marginTop: '0.2rem' }}>
                          Expires {m.inviteExpiresAt ? lagos.format(new Date(m.inviteExpiresAt)) : ''}
                        </Text>
                      </div>
                    )}
                  </td>
                  {isOwner && (
                    <td style={{ textAlign: 'right' }}>
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
      </div>

      {/* Staff & Attendants: Mobile Cards (<= 860px) */}
      <div className="pk-cards-mobile">
        {team.items.map((m) => (
          <div key={m.id} className="pk-card pk-mobile-record-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: '1rem', color: 'var(--pk-color-text-primary)' }}>{m.name ?? '—'}</strong>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="pk-badge pk-badge--draft">{ROLE_LABEL[m.role]}</span>
                  {m.status === 'ACTIVE' ? (
                    <span className="pk-badge pk-badge--verified">Active</span>
                  ) : (
                    <span className="pk-badge pk-badge--submitted">Invited</span>
                  )}
                </div>
              </div>
            </div>

            {m.role === 'ATTENDANT' && (
              <div style={{ fontSize: '0.85rem', color: 'var(--pk-color-text-secondary)', background: 'var(--pk-color-bg-subtle, rgba(255, 255, 255, 0.03))', padding: '0.5rem 0.65rem', borderRadius: 'var(--pk-radius-sm, 0.25rem)' }}>
                <span style={{ color: 'var(--pk-color-text-tertiary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.15rem', fontWeight: 600 }}>Assigned Lots</span>
                {m.lotIds.length === 0
                  ? 'All lots'
                  : m.lotIds.map((id) => lotName.get(id) ?? 'Removed lot').join(', ')}
              </div>
            )}

            {m.status !== 'ACTIVE' && m.inviteExpiresAt && (
              <Text variant="caption" tone="tertiary">
                Invite expires {lagos.format(new Date(m.inviteExpiresAt))}
              </Text>
            )}

            {isOwner && m.role !== 'OWNER' && (
              <div style={{ marginTop: '0.35rem', paddingTop: '0.5rem', borderTop: '1px solid var(--pk-color-border-subtle)' }}>
                <RemoveMemberButton
                  operatorId={operatorId}
                  memberId={m.id}
                  label={m.status === 'ACTIVE' ? 'Remove Member' : 'Cancel Invite'}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <Text variant="body-sm" tone="tertiary">
        Removing someone signs them out of Parkly everywhere straight away.
      </Text>

      <Text variant="heading-md" as="h2">
        Attendant phones
      </Text>
      <Text tone="secondary">
        Attendants use the gate app (this portal's /attend page) on their phone. Approve a new phone
        before it can check cars in. Blocking a phone signs it out of the gate app and wipes its
        data. Your own phone and your managers' phones need no approval.
      </Text>
      {devices.items.length === 0 ? (
        <Text tone="tertiary">No attendant phones yet.</Text>
      ) : (
        <>
          {/* Attendant Phones: Desktop Table */}
          <div className="pk-table-desktop">
            <div className="pk-table-wrap">
              <table className="pk-table">
                <thead>
                  <tr>
                    <th scope="col">Who</th>
                    <th scope="col">Lot</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last seen</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.items.map((d) => (
                    <tr key={d.id}>
                      <td>{d.attendantName ?? '—'}</td>
                      <td>{d.lotName}</td>
                      <td>
                        {d.revoked ? (
                          <span className="pk-badge pk-badge--rejected">Blocked</span>
                        ) : d.approved ? (
                          <span className="pk-badge pk-badge--verified">Approved</span>
                        ) : (
                          <span className="pk-badge pk-badge--submitted">Pending Approval</span>
                        )}
                      </td>
                      <td>{lagos.format(new Date(d.lastSeenAt))}</td>
                      <td>
                        {!d.approved && (
                          <DeviceDecisionButton
                            operatorId={operatorId}
                            deviceId={d.id}
                            decision="approve"
                          />
                        )}
                        {!d.revoked && (
                          <DeviceDecisionButton
                            operatorId={operatorId}
                            deviceId={d.id}
                            decision="revoke"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attendant Phones: Mobile Cards (<= 860px) */}
          <div className="pk-cards-mobile">
            {devices.items.map((d) => (
              <div key={d.id} className="pk-card pk-mobile-record-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--pk-color-text-primary)' }}>{d.attendantName ?? '—'}</strong>
                    <Text variant="body-sm" tone="secondary" style={{ marginTop: '0.15rem' }}>
                      {d.lotName}
                    </Text>
                  </div>
                  {d.revoked ? (
                    <span className="pk-badge pk-badge--rejected" style={{ flexShrink: 0 }}>Blocked</span>
                  ) : d.approved ? (
                    <span className="pk-badge pk-badge--verified" style={{ flexShrink: 0 }}>Approved</span>
                  ) : (
                    <span className="pk-badge pk-badge--submitted" style={{ flexShrink: 0 }}>Pending Approval</span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--pk-color-text-tertiary)', background: 'var(--pk-color-bg-subtle, rgba(255, 255, 255, 0.03))', padding: '0.4rem 0.65rem', borderRadius: 'var(--pk-radius-sm, 0.25rem)' }}>
                  <span>Last seen</span>
                  <span style={{ fontWeight: 500, color: 'var(--pk-color-text-secondary)' }}>{lagos.format(new Date(d.lastSeenAt))}</span>
                </div>

                {(!d.approved || !d.revoked) && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', paddingTop: '0.5rem', borderTop: '1px solid var(--pk-color-border-subtle)', flexWrap: 'wrap' }}>
                    {!d.approved && (
                      <DeviceDecisionButton
                        operatorId={operatorId}
                        deviceId={d.id}
                        decision="approve"
                      />
                    )}
                    {!d.revoked && (
                      <DeviceDecisionButton
                        operatorId={operatorId}
                        deviceId={d.id}
                        decision="revoke"
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

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
