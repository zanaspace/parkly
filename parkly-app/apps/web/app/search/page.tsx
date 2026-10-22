import type { LotSearchResponse, LotSearchResult } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchForm } from '../../components/search-form';
import { api, ApiProblem } from '../../lib/api';
import { AMENITY_LABEL, problemText } from '../../lib/copy';
import {
  dateRange,
  distanceLabel,
  readSearch,
  searchQuery,
  searchWindow,
  spacesLabel,
  windowLabel,
  type SearchInput,
} from '../../lib/search';

export const metadata: Metadata = {
  title: 'Find parking · Parkly',
  // Results change by the minute and by the driver's time; keep them out of search engines.
  robots: { index: false },
};

function ResultCard({ lot, search }: { lot: LotSearchResult; search: SearchInput }) {
  const spaces = spacesLabel(lot.availableCount, lot.isOpen);
  const bookable = lot.isOpen && lot.isAvailable;
  return (
    <li>
      <Link className="pk-result" href={`/lots/${lot.slug}?${searchQuery(search)}`}>
        {lot.photoUrl ? (
          // Supabase CDN images; sizes come from the stored WebP copies.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pk-result__photo" src={lot.photoUrl} alt="" loading="lazy" />
        ) : (
          <div className="pk-result__photo pk-result__photo--empty" aria-hidden="true">
            P
          </div>
        )}
        <div className="pk-result__body">
          <div className="pk-row pk-row--between">
            <Text variant="label-lg" as="h3">
              {lot.name}
            </Text>
            <span className="pk-badge-verified">✓ Verified</span>
          </div>
          <Text variant="body-sm" tone="secondary">
            {lot.area ? `${lot.area} · ` : ''}
            {distanceLabel(lot.distanceM)}
          </Text>
          {lot.amenities.length > 0 && (
            <Text variant="body-sm" tone="tertiary">
              {lot.amenities.map((a) => AMENITY_LABEL[a]).join(' · ')}
            </Text>
          )}
          <div className="pk-row pk-row--between">
            <span className={bookable ? 'pk-spaces' : 'pk-spaces pk-spaces--none'}>{spaces}</span>
            <span className="pk-price">
              {formatNaira(lot.quote.totalKobo)}
              <span className="pk-price__note"> total</span>
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** D-12 Results (doc 03 §1.2): LIVE, verified lots only, nearest first. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const query = await searchParams;
  let search = readSearch(query, now);
  const window = searchWindow(search);
  const { today, lastDay } = dateRange(now);
  const find = (radiusM: number) =>
    api<LotSearchResponse>(
      `/v1/lots/search?${new URLSearchParams({
        lat: String(search.lat),
        lng: String(search.lng),
        radiusM: String(radiusM),
        startAt: window.startAt,
        endAt: window.endAt,
        product: window.product,
        sort: search.sort,
      }).toString()}`,
    );

  let result: LotSearchResponse | null = null;
  let problem: string | null = null;
  let widened = false;
  try {
    result = await find(search.radiusM);
    // Doc 03 §1.2: nothing within 2 km → widen to 3 km automatically, then show the empty state.
    if (result.items.length === 0 && query.radius === undefined) {
      result = await find(3000);
      search = { ...search, radiusM: 3000 };
      widened = result.items.length > 0;
    }
  } catch (err) {
    problem = problemText(err instanceof ApiProblem ? err.code : 'UNKNOWN');
  }
  const wider = search.radiusM < 5000 ? (search.radiusM < 3000 ? 3000 : 5000) : null;

  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-link" href="/">
        ← Parkly
      </Link>
      <Text variant="heading-lg" as="h1">
        Parking near {search.place}
      </Text>
      <Text tone="secondary">{windowLabel(search)}</Text>

      <details className="pk-card">
        <summary className="pk-link">Change search</summary>
        <SearchForm initial={search} today={today} lastDay={lastDay} />
      </details>

      {widened && (
        <Text variant="body-sm" tone="secondary">
          Nothing within 2 km, so we looked a little further.
        </Text>
      )}

      {problem && (
        <p className="pk-notice pk-notice--error" role="alert">
          {problem}
        </p>
      )}

      {result && result.items.length > 0 && (
        <>
          <div className="pk-row pk-row--between">
            <Text variant="body-sm" tone="secondary">
              {result.items.length} verified car park{result.items.length === 1 ? '' : 's'} within{' '}
              {search.radiusM / 1000} km
            </Text>
            <nav className="pk-row" aria-label="Sort">
              {(['distance', 'price'] as const).map((sort) =>
                sort === search.sort ? (
                  <span key={sort} className="pk-chip pk-chip--on" aria-current="true">
                    {sort === 'distance' ? 'Nearest' : 'Cheapest'}
                  </span>
                ) : (
                  <Link
                    key={sort}
                    className="pk-chip"
                    href={`/search?${searchQuery(search, { sort })}`}
                  >
                    {sort === 'distance' ? 'Nearest' : 'Cheapest'}
                  </Link>
                ),
              )}
            </nav>
          </div>
          <ul className="pk-results">
            {result.items.map((lot) => (
              <ResultCard key={lot.id} lot={lot} search={search} />
            ))}
          </ul>
          <Text variant="body-sm" tone="tertiary">
            Prices are the total for your time, including Parkly’s service fee.
          </Text>
        </>
      )}

      {result && result.items.length === 0 && (
        <section className="pk-card">
          <Text variant="label-lg" as="h2">
            No verified car parks within {search.radiusM / 1000} km for that time
          </Text>
          <Text tone="secondary">
            Try a wider area or a different time. Parkly only lists car parks we have checked.
          </Text>
          {wider && (
            <Link className="pk-link" href={`/search?${searchQuery(search, { radiusM: wider })}`}>
              Search within {wider / 1000} km
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
