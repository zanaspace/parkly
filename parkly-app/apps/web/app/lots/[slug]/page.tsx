import type { LotAvailability, PublicLot, Quote } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { Button, Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { LotsMap } from '../../../components/lots-map';
import { SearchForm } from '../../../components/search-form';
import { api, ApiProblem } from '../../../lib/api';
import { AMENITY_LABEL, CHECK_LABEL, priceLine, problemText } from '../../../lib/copy';
import {
  dateRange,
  dayLabel,
  lagosWeekday,
  lineLabel,
  readSearch,
  searchQuery,
  searchWindow,
  spacesLabel,
  windowLabel,
} from '../../../lib/search';

type Params = Promise<{ slug: string }>;
type Query = Promise<Record<string, string | string[] | undefined>>;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One fetch per request for the page and its metadata; the API sends s-maxage=60. */
const loadLot = cache(async (slug: string): Promise<PublicLot | null> => {
  try {
    return await api<PublicLot>(`/v1/lots/${encodeURIComponent(slug)}`, { revalidate: 60 });
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const lot = await loadLot((await params).slug);
  if (!lot) return { title: 'Car park not found · Parkly' };
  const where = lot.area ?? 'Lagos';
  return {
    title: `${lot.name}, ${where} · Verified parking | Parkly`,
    description: `Verified parking at ${lot.addressLine}. ${lot.prices.map(priceLine).join(' · ')}. Check the price for your time on Parkly.`,
    openGraph: lot.photos[0] ? { images: [lot.photos[0].url] } : null,
  };
}

/** Schema.org data so search engines understand the page (doc 03 §5.1 D-13 public SEO page). */
function structuredData(lot: PublicLot) {
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return {
    '@context': 'https://schema.org',
    '@type': 'ParkingFacility',
    name: lot.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: lot.addressLine,
      addressLocality: lot.area ?? 'Lagos',
      addressRegion: 'Lagos',
      addressCountry: 'NG',
    },
    geo: { '@type': 'GeoCoordinates', latitude: lot.location.lat, longitude: lot.location.lng },
    openingHours: lot.openingHours.map((d) =>
      d.is24h ? `${days[d.weekday]} 00:00-23:59` : `${days[d.weekday]} ${d.opensAt}-${d.closesAt}`,
    ),
    ...(lot.photos[0] ? { image: lot.photos[0].url } : {}),
  };
}

async function priceForWindow(
  lot: PublicLot,
  query: Record<string, string | string[] | undefined>,
) {
  const search = readSearch(query, new Date());
  const window = searchWindow(search);
  try {
    const [quote, availability] = await Promise.all([
      api<Quote>(`/v1/lots/${lot.id}/quote`, {
        method: 'POST',
        body: { product: window.product, startAt: window.startAt, endAt: window.endAt },
      }),
      api<LotAvailability>(
        `/v1/lots/${lot.id}/availability?${new URLSearchParams({
          startAt: window.startAt,
          endAt: window.endAt,
          product: window.product,
        }).toString()}`,
      ),
    ]);
    return { search, quote, availability, problem: null };
  } catch (err) {
    return {
      search,
      quote: null,
      availability: null,
      problem: problemText(err instanceof ApiProblem ? err.code : 'UNKNOWN'),
    };
  }
}

/** D-13 Lot detail and public lot page (doc 03 §1.3). */
export default async function LotPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Query;
}) {
  const lot = await loadLot((await params).slug);
  if (!lot) notFound();
  const query = await searchParams;
  const hasWindow = typeof query.date === 'string';
  const priced = hasWindow ? await priceForWindow(lot, query) : null;
  const now = new Date();
  const { today, lastDay } = dateRange(now);
  const todayWeekday = lagosWeekday(now);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${lot.location.lat},${lot.location.lng}`;

  return (
    <main className="pk-page pk-page--wide">
      <script
        type="application/ld+json"
        // JSON.stringify output of our own data; `<` is escaped so it can't close the tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(lot)).replace(/</g, '\\u003c'),
        }}
      />
      <Link className="pk-link" href={priced ? `/search?${searchQuery(priced.search)}` : '/'}>
        ← {priced ? 'Back to results' : 'Parkly'}
      </Link>

      <header className="pk-lot-head">
        <div className="pk-row">
          <Text variant="heading-xl" as="h1">
            {lot.name}
          </Text>
          <span className="pk-badge-verified">✓ Verified</span>
        </div>
        <Text tone="secondary">
          {lot.addressLine}
          {lot.area && !lot.addressLine.includes(lot.area) ? `, ${lot.area}` : ''}
        </Text>
      </header>

      {lot.photos.length > 0 && (
        <ul className="pk-photo-strip" aria-label="Photos">
          {lot.photos.map((p, i) => (
            <li key={p.url}>
              {/* Public Supabase CDN copies of admin-approved photos. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`${lot.name}, photo ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="pk-lot-grid">
        <div className="pk-stack">
          <section className="pk-card" aria-labelledby="price-heading">
            <Text variant="heading-md" as="h2" id="price-heading">
              {priced ? `Your price for ${windowLabel(priced.search)}` : 'Check your price'}
            </Text>
            {priced?.problem && (
              <p className="pk-notice pk-notice--error" role="alert">
                {priced.problem}
              </p>
            )}
            {priced?.quote && (
              <>
                <table className="pk-breakdown">
                  <tbody>
                    {priced.quote.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{lineLabel(l)}</td>
                        <td>{formatNaira(l.amountKobo)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td>{formatNaira(priced.quote.totalKobo)}</td>
                    </tr>
                  </tfoot>
                </table>
                {priced.availability && (
                  <Text tone="secondary">
                    {spacesLabel(priced.availability.availableCount, priced.availability.isOpen)}
                  </Text>
                )}
                <Button type="button" disabled fullWidth>
                  Booking opens soon
                </Button>
                <Text variant="body-sm" tone="tertiary">
                  Online booking and payment are coming next. The price above is exactly what you
                  will pay.
                </Text>
              </>
            )}
            <details open={!priced}>
              <summary className="pk-link">
                {priced ? 'Change time' : 'Pick a date and time'}
              </summary>
              <SearchForm
                initial={priced?.search ?? readSearch({}, now)}
                today={today}
                lastDay={lastDay}
                action={`/lots/${lot.slug}`}
              />
            </details>
          </section>

          <section className="pk-card" aria-labelledby="getting-there">
            <Text variant="heading-md" as="h2" id="getting-there">
              Getting there
            </Text>
            <LotsMap
              centre={lot.location}
              height="14rem"
              pins={[
                {
                  id: lot.id,
                  lat: lot.location.lat,
                  lng: lot.location.lng,
                  label: 'P',
                  title: lot.name,
                },
              ]}
            />
            {lot.entranceNotes && <Text>{lot.entranceNotes}</Text>}
            <a className="pk-link" href={directions} target="_blank" rel="noopener noreferrer">
              Get directions (Google Maps)
            </a>
          </section>

          {lot.description && (
            <section className="pk-card">
              <Text variant="heading-md" as="h2">
                About
              </Text>
              <Text>{lot.description}</Text>
            </section>
          )}
        </div>

        <div className="pk-stack">
          <section className="pk-card" aria-labelledby="prices-heading">
            <Text variant="heading-md" as="h2" id="prices-heading">
              Prices
            </Text>
            <ul className="pk-list">
              {lot.prices.map((p) => (
                <li key={p.product}>{priceLine(p)}</li>
              ))}
            </ul>
            <Text variant="body-sm" tone="tertiary">
              Plus Parkly’s small service fee on stays under 24 hours, shown in your price.
            </Text>
          </section>

          <section className="pk-card" aria-labelledby="hours-heading">
            <Text variant="heading-md" as="h2" id="hours-heading">
              Opening hours
            </Text>
            <table className="pk-hours">
              <tbody>
                {WEEKDAYS.map((name, weekday) => {
                  const d = lot.openingHours.find((h) => h.weekday === weekday);
                  return (
                    <tr key={name} className={weekday === todayWeekday ? 'pk-today' : undefined}>
                      <th scope="row">{name}</th>
                      <td>
                        {!d ? 'Closed' : d.is24h ? 'Open 24 hours' : `${d.opensAt}–${d.closesAt}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {lot.amenities.length > 0 && (
            <section className="pk-card" aria-labelledby="amenities-heading">
              <Text variant="heading-md" as="h2" id="amenities-heading">
                Facilities
              </Text>
              <ul className="pk-chips">
                {lot.amenities.map((a) => (
                  <li key={a} className="pk-chip">
                    {AMENITY_LABEL[a]}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="pk-card pk-verified" aria-labelledby="verified-heading">
            <Text variant="heading-md" as="h2" id="verified-heading">
              ✓ Verified by Parkly
            </Text>
            <Text variant="body-sm" tone="secondary">
              Visited on {dayLabel(lot.verification.verifiedOn)} · LASPA permit ending{' '}
              {lot.verification.permitNumberLast4} · run by {lot.operatorName}
            </Text>
            <ul className="pk-list">
              {lot.verification.checksPassed.map((c) => (
                <li key={c}>✓ {CHECK_LABEL[c]}</li>
              ))}
            </ul>
          </section>

          <section className="pk-card" aria-labelledby="policies-heading">
            <Text variant="heading-md" as="h2" id="policies-heading">
              Good to know
            </Text>
            <ul className="pk-list">
              <li>Free cancellation until 30 minutes before your start time.</li>
              <li>We hold your space for 30 minutes after your start time.</li>
              <li>Staying longer? Overstay is charged per 15 minutes after a 10-minute grace.</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
