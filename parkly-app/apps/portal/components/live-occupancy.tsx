'use client';

import type { Occupancy } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  freeTone,
  isStale,
  REFRESH_MS,
  totals,
  updatedLabel,
  type OccupancyItem,
} from '../lib/occupancy/live';
import { GateIcon } from './icons';

type Live = { items: OccupancyItem[]; asOf: string; stale: boolean };

const LiveContext = createContext<Live | null>(null);

function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error('LiveOccupancy components need <LiveOccupancyProvider>');
  return live;
}

const TONE_BADGE = {
  full: 'pk-badge--rejected',
  busy: 'pk-badge--submitted',
  ok: 'pk-badge--live',
};

/**
 * FR-OPS-001: keeps the occupancy numbers live. Refreshes every 15 s while the
 * tab is visible (doc 20 S7 task 1), straight away when it becomes visible
 * again, and flags the numbers once refreshes have failed for 45 s.
 */
export function LiveOccupancyProvider({
  operatorId,
  initial,
  children,
}: {
  operatorId: string | null;
  initial: Occupancy | null;
  children: ReactNode;
}) {
  const [data, setData] = useState<Occupancy>(
    initial ?? { items: [], asOf: new Date().toISOString() },
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!operatorId) return;
    let cancelled = false;
    const refresh = async () => {
      setNow(Date.now());
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/api/operators/${operatorId}/occupancy`, { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as Occupancy;
        if (!cancelled) {
          setData(next);
          setNow(Date.now());
        }
      } catch {
        // Offline or the API is down: keep the last numbers; `stale` shows it.
      }
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [operatorId]);

  const value: Live = { items: data.items, asOf: data.asOf, stale: isStale(data.asOf, now) };
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** The big number on the gate card: cars in all lots now. */
export function LiveGateCount() {
  const { items } = useLive();
  const t = totals(items);
  return (
    <>
      <div className="pk-stat-count" aria-live="polite">
        {t.inLot}
      </div>
      <Text variant="body-sm" tone="secondary" style={{ marginTop: '0.5rem', display: 'block' }}>
        Cars in your car parks now. {t.available} spaces free, {t.expected} bookings still to arrive
        in the next 24 hours.
      </Text>
    </>
  );
}

function Status() {
  const { asOf, stale } = useLive();
  return (
    <span
      className={`pk-badge ${stale ? 'pk-badge--rejected' : 'pk-badge--live'}`}
      style={{ textTransform: 'none' }}
      role="status"
    >
      {stale ? `Not updating · ${updatedLabel(asOf)}` : `Live · ${updatedLabel(asOf)}`}
    </span>
  );
}

function FreeBadge({ o }: { o: OccupancyItem }) {
  return (
    <span
      className={`pk-badge ${TONE_BADGE[freeTone(o.available, o.capacityTotal)]}`}
      style={{ textTransform: 'none', fontSize: '0.8rem', flexShrink: 0 }}
    >
      {o.available} of {o.capacityTotal} free
    </span>
  );
}

/** The per-lot table (cards on narrow screens). */
export function LiveOccupancyTable() {
  const { items } = useLive();
  return (
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
            Live car park occupancy
          </Text>
          <Text variant="body-sm" tone="secondary">
            Cars in each car park now and bookings still to arrive. Refreshes every 15 seconds.
          </Text>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Status />
          <a className="pk-nav-link pk-nav-link--active" href="/attend">
            <GateIcon size={16} />
            <span>Open the gate app</span>
          </a>
        </div>
      </div>

      {items.length > 0 ? (
        <>
          <div className="pk-table-desktop">
            <div className="pk-table-wrap">
              <table className="pk-table">
                <thead>
                  <tr>
                    <th scope="col">Car park</th>
                    <th scope="col">Parkly cars in</th>
                    <th scope="col">Walk-ins</th>
                    <th scope="col">Still to arrive (24 h)</th>
                    <th scope="col">Free now</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr key={o.lotId}>
                      <td>
                        <strong style={{ color: 'var(--pk-color-text-primary)' }}>{o.name}</strong>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--pk-color-text-brand)' }}>
                          {o.parked}
                        </span>
                      </td>
                      <td>{o.walkIns}</td>
                      <td>{o.expected}</td>
                      <td>
                        <FreeBadge o={o} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pk-cards-mobile">
            {items.map((o) => (
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
                  <FreeBadge o={o} />
                </div>
                <div className="pk-mobile-record-metrics pk-mobile-record-metrics--3col">
                  <div className="pk-mobile-metric-item">
                    <span className="pk-mobile-metric-label">Parkly cars</span>
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
                    <span className="pk-mobile-metric-label">To arrive</span>
                    <span className="pk-mobile-metric-val">{o.expected}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="pk-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <Text variant="heading-md">No live car parks yet</Text>
          <Text tone="secondary" style={{ maxWidth: '30rem', marginInline: 'auto' }}>
            Once a car park is live, you’ll see cars in, walk-ins and free spaces here.
          </Text>
          <div
            style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}
          >
            <Link className="pk-nav-link pk-nav-link--active" href="/lots/new">
              + Add a car park
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
