'use client';

import type { SupportBooking } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { searchSupport, type SupportResult } from '../lib/bookings/actions';
import { lagosShort, resultSummary } from '../lib/bookings/support';
import { formatKobo } from '../lib/lots/copy';

const WAIT_MS = 300;

function Row({ b }: { b: SupportBooking }) {
  return (
    <li>
      <Link className="pk-card pk-support-hit" href={`/bookings/${b.id}`}>
        <span className="pk-support-hit__main">
          <strong className="pk-support-hit__code">{b.code}</strong>
          <span className="pk-badge pk-badge--submitted">
            {b.status.replace('_', ' ').toLowerCase()}
          </span>
        </span>
        <Text variant="body-sm">
          {b.lotName} · {b.operatorName} · {lagosShort(b.startAt)} → {lagosShort(b.endAt)}
        </Text>
        <Text variant="body-sm" tone="secondary">
          {[b.driver.firstName, b.driver.phoneMasked, b.plate].filter(Boolean).join(' · ')} ·{' '}
          {formatKobo(b.totalKobo)}
        </Text>
      </Link>
    </li>
  );
}

/**
 * FR-ADM-002: one box, results as you type. The API works out whether it's a
 * booking code, phone, plate or payment reference; drivers come back masked.
 */
export function SupportSearch() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<SupportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const text = q.trim();
    const ticket = ++latest.current;
    if (text.length < 4) {
      setResult(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(async () => {
      const res = await searchSupport(text);
      // Only the answer to the newest query is shown.
      if (ticket === latest.current) {
        setResult(res);
        setBusy(false);
      }
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <section aria-labelledby="support-search-label" className="pk-support-search">
      <label id="support-search-label" className="pk-field__label" htmlFor="support-q">
        Find a booking
      </label>
      <input
        id="support-q"
        type="search"
        className="pk-input"
        placeholder="Booking code, phone number, plate or payment reference"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={100}
        autoComplete="off"
        aria-controls="support-results"
      />
      <div id="support-results" aria-live="polite" aria-busy={busy}>
        {busy && (
          <Text variant="body-sm" tone="secondary">
            Searching…
          </Text>
        )}
        {!busy && result && !result.ok && (
          <p className="pk-notice pk-notice--error" role="alert">
            {result.error}
          </p>
        )}
        {!busy && result?.ok && (
          <>
            <Text variant="body-sm" tone="secondary">
              {resultSummary(result.kind, result.items.length)}
            </Text>
            {result.items.length > 0 && (
              <ul className="pk-list pk-support-hits">
                {result.items.map((b) => (
                  <Row key={b.id} b={b} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
