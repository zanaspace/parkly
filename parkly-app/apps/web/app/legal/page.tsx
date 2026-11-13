import { Text } from '@parkly/ui';
import Link from 'next/link';
import { OPERATORS } from '../../lib/legal/operators';
import { PRIVACY } from '../../lib/legal/privacy';
import { TERMS } from '../../lib/legal/terms';
import type { LegalDoc } from '../../lib/legal/types';

export const metadata = { title: 'Legal · Parkly' };

const GROUPS: { heading: string; intro: string; docs: LegalDoc[] }[] = [
  {
    heading: 'For drivers',
    intro: 'These apply when you find, book and pay for parking.',
    docs: [TERMS, PRIVACY],
  },
  {
    heading: 'For car park operators',
    intro: 'These apply when you list a car park and take bookings through Parkly.',
    docs: [OPERATORS],
  },
];

/** The documents each kind of person agrees to, grouped so everyone finds theirs. */
export default function LegalIndexPage() {
  return (
    <main className="pk-page pk-legal">
      <Text variant="heading-xl" as="h1">
        Legal
      </Text>
      <Text tone="secondary">The documents that apply when you use Parkly.</Text>
      {GROUPS.map((g) => (
        <section key={g.heading} aria-labelledby={`${g.heading}-h`} className="pk-legal-section">
          <Text variant="heading-lg" as="h2" id={`${g.heading}-h`}>
            {g.heading}
          </Text>
          <Text tone="secondary">{g.intro}</Text>
          <ul className="pk-list">
            {g.docs.map((d) => (
              <li key={d.slug} className="pk-card">
                <Link className="pk-link" href={`/legal/${d.slug}`}>
                  <Text variant="heading-md" as="span">
                    {d.title}
                  </Text>
                </Link>
                <Text tone="secondary">{d.summary}</Text>
                <Text variant="body-sm" tone="tertiary">
                  Version {d.version} · Last updated {d.updated}
                  {d.draft ? ' · Draft, not yet reviewed by a lawyer' : ''}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
