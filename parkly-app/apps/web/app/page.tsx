import { Text } from '@parkly/ui';
import Link from 'next/link';
import { connection } from 'next/server';
import { SearchForm } from '../components/search-form';
import { AREAS, dateRange, readSearch } from '../lib/search';

/** D-10 Home: search first, then what Parkly promises. */
export default async function Home() {
  // Today's date sets the defaults, so render per request rather than at build time.
  await connection();
  const now = new Date();
  const initial = readSearch({}, now);
  const { today, lastDay } = dateRange(now);
  return (
    <main className="pk-page pk-page--wide">
      <section className="pk-hero">
        <Text variant="overline" tone="brand">
          Parkly
        </Text>
        <Text variant="heading-xl" as="h1">
          Safe, verified parking in Lagos
        </Text>
        <Text tone="secondary">
          Find a space at a checked car park, see the full price before you go, and park without
          touts.
        </Text>
      </section>

      <section className="pk-card" aria-label="Find parking">
        <SearchForm initial={initial} today={today} lastDay={lastDay} />
      </section>

      <section className="pk-promises" aria-label="Why Parkly">
        <div>
          <Text variant="label-lg" as="h2">
            Verified car parks
          </Text>
          <Text variant="body-sm" tone="secondary">
            Every car park has a LASPA permit and a site visit by the Parkly team before it appears.
          </Text>
        </div>
        <div>
          <Text variant="label-lg" as="h2">
            The full price, upfront
          </Text>
          <Text variant="body-sm" tone="secondary">
            You see the exact total for your time, including our service fee. No surprises at the
            gate.
          </Text>
        </div>
        <div>
          <Text variant="label-lg" as="h2">
            Cashless
          </Text>
          <Text variant="body-sm" tone="secondary">
            Book and pay online (coming soon), then show your ticket at the entrance.
          </Text>
        </div>
      </section>

      <section aria-label="Popular areas">
        <Text variant="label-lg" as="h2">
          Popular areas
        </Text>
        <ul className="pk-chips">
          {AREAS.slice(0, 6).map((a) => (
            <li key={a.key}>
              <Link className="pk-chip" href={`/search?area=${a.key}`}>
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
