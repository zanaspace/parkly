import type { LotSummary, Occupancy, Operator, Outlook, TeamMember } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { GateIcon, LotsIcon, ShieldCheckIcon, TeamIcon } from '../../components/icons';
import {
  LiveGateCount,
  LiveOccupancyProvider,
  LiveOccupancyTable,
} from '../../components/live-occupancy';
import { WeekOutlook } from '../../components/week-outlook';
import { apiFetch } from '../../lib/api';
import { requireAccess } from '../../lib/auth/session';
import { publicEnv } from '../../lib/env';

export const metadata = { title: 'Dashboard · Parkly for Operators' };

const KYB_BADGE: Record<Operator['kybStatus'], { label: string; class: string }> = {
  NOT_STARTED: { label: 'Action Needed', class: 'pk-badge--submitted' },
  SUBMITTED: { label: 'In Review', class: 'pk-badge--submitted' },
  APPROVED: { label: 'Verified', class: 'pk-badge--verified' },
  REJECTED: { label: 'Action Needed', class: 'pk-badge--rejected' },
};

export default async function PortalHome() {
  const { me, accessToken } = await requireAccess();
  const grant = me.roles.find((r) => r.role === 'OPERATOR_OWNER' || r.role === 'OPERATOR_MANAGER');
  const operatorId = grant?.operatorId ?? null;
  const isOwner = grant?.role === 'OPERATOR_OWNER';
  const api = publicEnv().apiUrl;

  const [operator, members, occupancy, lotsRes, outlook] = operatorId
    ? await Promise.all([
        apiFetch<Operator>(api, `/v1/operators/${operatorId}`, accessToken).catch(() => null),
        apiFetch<{ items: TeamMember[] }>(api, `/v1/operators/${operatorId}/members`, accessToken)
          .then((r) => r.items)
          .catch(() => []),
        apiFetch<Occupancy>(api, `/v1/operators/${operatorId}/occupancy`, accessToken).catch(
          () => null,
        ),
        apiFetch<{ items: LotSummary[] }>(api, `/v1/operators/${operatorId}/lots`, accessToken)
          .then((r) => r.items)
          .catch(() => []),
        apiFetch<Outlook>(api, `/v1/operators/${operatorId}/outlook`, accessToken)
          .then((r) => r.items)
          .catch(() => []),
      ])
    : [null, [], null, [], []];

  const lots = lotsRes ?? [];
  const liveLotsCount = lots.filter((l) => l.status === 'LIVE').length;
  const totalBookableSpaces = lots.reduce((acc, l) => acc + l.capacityBookable, 0);

  const activeStaff = members.filter((m) => m.status === 'ACTIVE').length;
  const invitedStaff = members.filter((m) => m.status === 'INVITED').length;

  const kybBadge = operator ? KYB_BADGE[operator.kybStatus] : KYB_BADGE.NOT_STARTED;

  return (
    <LiveOccupancyProvider operatorId={operatorId} initial={occupancy}>
      <main className="pk-page pk-page--wide">
        {/* Header section */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <Text variant="heading-xl">Welcome back{me.firstName ? `, ${me.firstName}` : ''}</Text>
            <Text variant="body-sm" tone="secondary">
              {operator ? (
                <>
                  <strong style={{ color: 'var(--pk-color-text-primary)' }}>
                    {operator.tradingName}
                  </strong>
                  {operator.legalName ? ` (${operator.legalName})` : ''} · Role:{' '}
                  <strong style={{ color: 'var(--pk-color-text-brand)' }}>
                    {isOwner ? 'Owner' : 'Manager'}
                  </strong>
                </>
              ) : (
                'Parkly Operations Console'
              )}
            </Text>
          </div>
          {operator && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span
                className={`pk-badge ${kybBadge.class}`}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              >
                KYB: {kybBadge.label}
              </span>
            </div>
          )}
        </div>

        <Text variant="heading-md" as="h2">
          Operations Overview
        </Text>

        {/* 4 Executive Metric Cards */}
        <div className="pk-stat-grid">
          {/* Lots & Spaces Card */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--pk-color-text-brand)',
                  }}
                >
                  <LotsIcon size={19} />
                  <Text variant="label-lg" tone="brand">
                    Lots & Parking
                  </Text>
                </div>
                <span
                  className={`pk-badge ${liveLotsCount > 0 ? 'pk-badge--live' : 'pk-badge--draft'}`}
                >
                  {liveLotsCount} Live
                </span>
              </div>
              <div className="pk-stat-count">{totalBookableSpaces}</div>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: '0.5rem', display: 'block' }}
              >
                {lots.length} {lots.length === 1 ? 'car park' : 'car parks'} configured. Total
                bookable bays open on Parkly.
              </Text>
            </div>
            <Link
              className="pk-nav-link pk-nav-link--active"
              href="/lots"
              style={{ justifyContent: 'center' }}
            >
              Manage Lots ({lots.length}) →
            </Link>
          </div>

          {/* Real-time Gate & Occupancy Card */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--pk-color-text-brand)',
                  }}
                >
                  <GateIcon size={19} />
                  <Text variant="label-lg" tone="brand">
                    Gate Scanner
                  </Text>
                </div>
                <span className="pk-badge pk-badge--live">Live Gate</span>
              </div>
              <LiveGateCount />
            </div>
            <a
              className="pk-nav-link pk-nav-link--active"
              href="/attend"
              style={{ justifyContent: 'center' }}
            >
              Open Gate App →
            </a>
          </div>

          {/* KYB & Settlement Verification Card */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--pk-color-text-brand)',
                  }}
                >
                  <ShieldCheckIcon size={19} />
                  <Text variant="label-lg" tone="brand">
                    Business KYB
                  </Text>
                </div>
                <span className={`pk-badge ${kybBadge.class}`}>{kybBadge.label}</span>
              </div>
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: 'var(--pk-color-text-primary)',
                  margin: '0.5rem 0',
                }}
              >
                {operator?.kybStatus === 'APPROVED' ? 'Fully Verified' : 'Compliance Check'}
              </div>
              <Text variant="body-sm" tone="secondary">
                CAC business documents, director verification, and Paystack settlement subaccount.
              </Text>
            </div>
            <Link
              className="pk-nav-link"
              href="/kyb"
              style={{ justifyContent: 'center', background: 'var(--pk-color-bg-subtle)' }}
            >
              {operator?.kybStatus === 'APPROVED'
                ? 'Inspect KYB Record →'
                : 'Complete KYB Review →'}
            </Link>
          </div>

          {/* Operations Team Card */}
          <div className="pk-stat-card">
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--pk-color-text-brand)',
                  }}
                >
                  <TeamIcon size={19} />
                  <Text variant="label-lg" tone="brand">
                    Staff & Attendants
                  </Text>
                </div>
                <span className="pk-badge pk-badge--verified">{activeStaff} Active</span>
              </div>
              <div className="pk-stat-count">{activeStaff + invitedStaff}</div>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: '0.5rem', display: 'block' }}
              >
                Attendants, managers, and authorized gate scanning devices assigned to your lots.
              </Text>
            </div>
            <Link
              className="pk-nav-link"
              href="/team"
              style={{ justifyContent: 'center', background: 'var(--pk-color-bg-subtle)' }}
            >
              Manage Team & Invites →
            </Link>
          </div>
        </div>

        <LiveOccupancyTable />
        <WeekOutlook outlook={outlook} />
      </main>
    </LiveOccupancyProvider>
  );
}
