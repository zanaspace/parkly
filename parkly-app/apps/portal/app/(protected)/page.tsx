import type { LotSummary, Occupancy, Operator, TeamMember } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { GateIcon, LotsIcon, ShieldCheckIcon, TeamIcon } from '../../components/icons';
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

  const [operator, members, occupancy, lotsRes] = operatorId
    ? await Promise.all([
        apiFetch<Operator>(api, `/v1/operators/${operatorId}`, accessToken).catch(() => null),
        apiFetch<{ items: TeamMember[] }>(api, `/v1/operators/${operatorId}/members`, accessToken)
          .then((r) => r.items)
          .catch(() => []),
        apiFetch<Occupancy>(api, `/v1/operators/${operatorId}/occupancy`, accessToken)
          .then((r) => r.items)
          .catch(() => []),
        apiFetch<{ items: LotSummary[] }>(api, `/v1/operators/${operatorId}/lots`, accessToken)
          .then((r) => r.items)
          .catch(() => []),
      ])
    : [null, [], [], []];

  const lots = lotsRes ?? [];
  const liveLotsCount = lots.filter((l) => l.status === 'LIVE').length;
  const totalBookableSpaces = lots.reduce((acc, l) => acc + l.capacityBookable, 0);

  const totalParked = occupancy.reduce((acc, o) => acc + o.parked + o.walkIns, 0);
  const totalExpected = occupancy.reduce((acc, o) => acc + o.expected, 0);

  const activeStaff = members.filter((m) => m.status === 'ACTIVE').length;
  const invitedStaff = members.filter((m) => m.status === 'INVITED').length;

  const kybBadge = operator ? KYB_BADGE[operator.kybStatus] : KYB_BADGE.NOT_STARTED;

  return (
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
            <div className="pk-stat-count">{totalParked}</div>
            <Text
              variant="body-sm"
              tone="secondary"
              style={{ marginTop: '0.5rem', display: 'block' }}
            >
              Currently parked vehicles. {totalExpected} expected bookings arriving in the next 24
              hours.
            </Text>
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
            {operator?.kybStatus === 'APPROVED' ? 'Inspect KYB Record →' : 'Complete KYB Review →'}
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

      {/* Real-time Occupancy Table */}
      <div style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <Text variant="heading-md" as="h2">
              Live Car Park Occupancy
            </Text>
            <Text variant="body-sm" tone="secondary">
              Real-time bay capacity and vehicle counts across all your parking facilities.
            </Text>
          </div>
          <a className="pk-nav-link pk-nav-link--active" href="/attend">
            <GateIcon size={16} />
            <span>Launch Gate Attendant App</span>
          </a>
        </div>

        {occupancy.length > 0 ? (
          <>
            {/* Desktop Table (> 860px) */}
            <div className="pk-table-desktop">
              <div className="pk-table-wrap">
                <table className="pk-table">
                  <thead>
                    <tr>
                      <th scope="col">Facility Name</th>
                      <th scope="col">Parked (Parkly)</th>
                      <th scope="col">Walk-ins</th>
                      <th scope="col">Expected (24h)</th>
                      <th scope="col">Available Bays</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        Gate Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {occupancy.map((o) => {
                      const freeSpaces = Math.max(0, o.capacityTotal - o.parked - o.walkIns);
                      return (
                        <tr key={o.lotId}>
                          <td>
                            <strong style={{ color: 'var(--pk-color-text-primary)' }}>
                              {o.name}
                            </strong>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--pk-color-text-brand)' }}>
                              {o.parked}
                            </span>
                          </td>
                          <td>{o.walkIns}</td>
                          <td>{o.expected}</td>
                          <td>
                            <span
                              className={`pk-badge ${freeSpaces > 0 ? 'pk-badge--live' : 'pk-badge--rejected'}`}
                              style={{ textTransform: 'none', fontSize: '0.8rem' }}
                            >
                              {freeSpaces} of {o.capacityTotal} free
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <a
                              className="pk-nav-link pk-nav-link--active"
                              href="/attend"
                              style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                            >
                              Check In/Out →
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards (<= 860px, fits 100% width with no horizontal scroll) */}
            <div className="pk-cards-mobile">
              {occupancy.map((o) => {
                const freeSpaces = Math.max(0, o.capacityTotal - o.parked - o.walkIns);
                return (
                  <div key={o.lotId} className="pk-card pk-mobile-record-card">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                      }}
                    >
                      <strong style={{ fontSize: '1rem', color: 'var(--pk-color-text-primary)' }}>
                        {o.name}
                      </strong>
                      <span
                        className={`pk-badge ${freeSpaces > 0 ? 'pk-badge--live' : 'pk-badge--rejected'}`}
                        style={{ textTransform: 'none', fontSize: '0.8rem', flexShrink: 0 }}
                      >
                        {freeSpaces} of {o.capacityTotal} free
                      </span>
                    </div>

                    <div className="pk-mobile-record-metrics pk-mobile-record-metrics--3col">
                      <div className="pk-mobile-metric-item">
                        <span className="pk-mobile-metric-label">Parked</span>
                        <span
                          className="pk-mobile-metric-val"
                          style={{ color: 'var(--pk-color-text-brand)' }}
                        >
                          {o.parked}
                        </span>
                      </div>
                      <div className="pk-mobile-metric-item">
                        <span className="pk-mobile-metric-label">Walk-ins</span>
                        <span className="pk-mobile-metric-val">{o.walkIns}</span>
                      </div>
                      <div className="pk-mobile-metric-item">
                        <span className="pk-mobile-metric-label">Expected</span>
                        <span className="pk-mobile-metric-val">{o.expected}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: '0.25rem' }}>
                      <a
                        className="pk-nav-link pk-nav-link--active pk-mobile-card-action"
                        href="/attend"
                      >
                        <span>Check In/Out (Gate App)</span>
                        <span aria-hidden="true">→</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="pk-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <Text variant="heading-md">No Live Gate Sessions</Text>
            <Text tone="secondary" style={{ maxWidth: '30rem', marginInline: 'auto' }}>
              Add a lot and start scanning tickets with the Gate App to see real-time vehicle
              occupancy, walk-ins, and free bays here.
            </Text>
            <div
              style={{
                marginTop: '1rem',
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'center',
              }}
            >
              <Link className="pk-nav-link pk-nav-link--active" href="/lots/new">
                + Add a Car Park
              </Link>
              <a
                className="pk-nav-link"
                href="/attend"
                style={{ background: 'var(--pk-color-bg-subtle)' }}
              >
                Open Gate Scanner
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
