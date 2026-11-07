'use client';

import type { CommissionRateList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { percent } from '../lib/finance/period';
import { filterRates } from '../lib/finance/rates';
import { CommissionForm } from './commission-form';

type Rate = CommissionRateList['items'][number];

const pageFor = (q: string) =>
  q.trim() ? `/finance/rates?q=${encodeURIComponent(q.trim())}` : '/finance/rates';

/**
 * Search, then every matching operator's rate, each opening to a form to
 * change it. The list filters as you type; the address bar follows, so a
 * filtered page can be shared. Without JavaScript it's a plain GET form.
 */
export function CommissionRates({ rates, query }: { rates: Rate[] | null; query: string }) {
  const [q, setQ] = useState(query);
  const deferred = useDeferredValue(q);
  const shown = rates ? filterRates(rates, deferred) : null;
  const total = rates?.length ?? 0;
  const term = deferred.trim();

  function change(next: string) {
    setQ(next);
    window.history.replaceState(null, '', pageFor(next));
  }

  return (
    <section aria-labelledby="rates-heading" className="pk-money">
      <form
        method="get"
        action="/finance/rates"
        role="search"
        className="pk-rates-search"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="pk-field__label" htmlFor="rates-q">
          Find an operator
        </label>
        <div className="pk-row">
          <input
            id="rates-q"
            name="q"
            type="search"
            className="pk-input pk-rates-input"
            placeholder="Start typing a trading or registered name"
            value={q}
            onChange={(e) => change(e.target.value)}
            maxLength={100}
            autoComplete="off"
            aria-controls="rates-list"
          />
          {q && (
            <Link
              className="pk-nav-link"
              href="/finance/rates"
              onClick={(e) => {
                e.preventDefault();
                change('');
              }}
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {shown === null ? (
        <Text variant="body-sm" tone="secondary" role="status">
          We couldn’t load rates just now. Please refresh to try again.
        </Text>
      ) : (
        <>
          <Text as="p" id="rates-heading" variant="body-sm" tone="secondary" role="status">
            {term
              ? `${shown.length} of ${total} ${total === 1 ? 'operator' : 'operators'} match “${term}”`
              : `${total} ${total === 1 ? 'operator' : 'operators'}`}
          </Text>
          {shown.length === 0 ? (
            <div className="pk-card">
              <Text>{term ? 'No operator matches that name.' : 'No operators yet.'}</Text>
            </div>
          ) : (
            <ul className="pk-list pk-rates" id="rates-list">
              {shown.map((r) => (
                <li key={r.operatorId} className="pk-card">
                  <details>
                    <summary className="pk-rates-summary">
                      <span>
                        <strong>{r.tradingName}</strong>
                        <Text as="span" variant="body-sm" tone="secondary">
                          {' '}
                          · {r.legalName} · KYB {r.kybStatus.toLowerCase().replace('_', ' ')}
                        </Text>
                      </span>
                      <span className="pk-badge pk-badge--verified">
                        {percent(r.commissionBps)}
                      </span>
                    </summary>
                    <CommissionForm operatorId={r.operatorId} currentBps={r.commissionBps} />
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
