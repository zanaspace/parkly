import { Text } from '@parkly/ui';
import Link from 'next/link';
import { connection } from 'next/server';
import { ChevronRightIcon, TicketIcon } from '../components/icons';
import { OnboardingAudienceSelector } from '../components/onboarding-audience/onboarding-audience-selector';
import { SearchForm } from '../components/search-form';
import { AREAS, dateRange, readSearch } from '../lib/search';
import { loadDriver } from '../lib/session';

/** D-10 Home: search first, then what Parkly promises. */
export default async function Home() {
  // Today's date sets the defaults, so render per request rather than at build time.
  await connection();
  const now = new Date();
  const initial = readSearch({}, now);
  const { today, lastDay } = dateRange(now);
  const driver = await loadDriver();

  return (
    <main className="pk-page pk-page--wide">
      <section className="pk-hero">
        <Text variant="overline" tone="brand">
          Parkly
        </Text>
        <Text variant="heading-xl" as="h1">
          {driver ? 'Find and reserve your next space' : 'Safe, verified parking in Lagos'}
        </Text>
        <Text tone="secondary">
          {driver
            ? 'Search checked car parks across Lagos, see upfront pricing, and park without touts.'
            : 'Find a space at a checked car park, see the full price before you go, and park without touts.'}
        </Text>
      </section>

      {/* Driver Quick Shortcuts when Signed In */}
      {driver && (
        <section
          className="pk-card"
          style={{
            padding: '1.25rem 1.75rem',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            background: 'var(--pk-color-bg-surface)',
            border: '1px solid var(--pk-color-teal-300, #71C4B8)',
            borderRadius: 'var(--pk-radius-lg, 0.75rem)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'var(--pk-color-teal-50, #EEF8F6)',
                color: 'var(--pk-color-teal-700, #0F5A53)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TicketIcon size={20} />
            </div>
            <div>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: 'var(--pk-color-text-primary)',
                  display: 'block',
                }}
              >
                Signed in as Verified Driver
              </span>
              <span style={{ fontSize: '0.825rem', color: 'var(--pk-color-text-secondary)' }}>
                View your active QR gate tickets, history, and monthly passes.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link
              href="/bookings"
              className="pk-button pk-button--primary pk-button--sm"
              style={{ textDecoration: 'none' }}
            >
              <span>My Bookings</span>
              <ChevronRightIcon size={14} style={{ marginLeft: '0.25rem' }} />
            </Link>
            <Link
              href="/passes"
              className="pk-button pk-button--secondary pk-button--sm"
              style={{ textDecoration: 'none' }}
            >
              Monthly Passes
            </Link>
          </div>
        </section>
      )}

      <section className="pk-card" aria-label="Find parking">
        <SearchForm initial={initial} today={today} lastDay={lastDay} />
      </section>

      {/* For Guests Only: Unified Multi-Audience Ecosystem Packages */}
      {!driver && <OnboardingAudienceSelector />}

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
