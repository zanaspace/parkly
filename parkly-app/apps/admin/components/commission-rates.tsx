import type { CommissionRateList } from '@parkly/contracts';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import { percent } from '../lib/finance/period';
import { CommissionForm } from './commission-form';

type Rate = CommissionRateList['items'][number];

/**
 * Search, then every matching operator's rate, each opening to a form to
 * change it. A plain GET form, so the search works without JavaScript and
 * the filtered page can be shared.
 */
export function CommissionRates({
  rates,
  total,
  query,
}: {
  rates: Rate[] | null;
  total: number;
  query: string;
}) {
  return (
    <section aria-labelledby="rates-heading" className="pk-money">
      <form method="get" action="/finance/rates" role="search" className="pk-rates-search">
        <label className="pk-field__label" htmlFor="rates-q">
          Find an operator
        </label>
        <div className="pk-row">
          <input
            id="rates-q"
            name="q"
            type="search"
            className="pk-input pk-rates-input"
            placeholder="Trading or registered name"
            defaultValue={query}
            maxLength={100}
            autoComplete="off"
          />
          <button type="submit" className="pk-button pk-button--primary">
            Search
          </button>
          {query && (
            <Link className="pk-nav-link" href="/finance/rates">
              Clear
            </Link>
          )}
        </div>
      </form>

      {rates === null ? (
        <Text variant="body-sm" tone="secondary" role="status">
          We couldn’t load rates just now. Please refresh to try again.
        </Text>
      ) : (
        <>
          <Text as="p" id="rates-heading" variant="body-sm" tone="secondary" role="status">
            {query
              ? `${rates.length} of ${total} ${total === 1 ? 'operator' : 'operators'} match “${query}”`
              : `${total} ${total === 1 ? 'operator' : 'operators'}`}
          </Text>
          {rates.length === 0 ? (
            <div className="pk-card">
              <Text>{query ? 'No operator matches that name.' : 'No operators yet.'}</Text>
            </div>
          ) : (
            <ul className="pk-list pk-rates">
              {rates.map((r) => (
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
