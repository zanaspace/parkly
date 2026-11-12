import { Text } from '@parkly/ui';
import Link from 'next/link';
import { PRIVACY } from '../../lib/legal/privacy';
import { TERMS } from '../../lib/legal/terms';

export const metadata = { title: 'Legal · Parkly' };

/** The documents a driver agrees to, and what each is about. */
export default function LegalIndexPage() {
  return (
    <main className="pk-page pk-legal">
      <Text variant="heading-xl" as="h1">
        Legal
      </Text>
      <Text tone="secondary">The documents that apply when you use Parkly.</Text>
      <ul className="pk-list">
        {[TERMS, PRIVACY].map((d) => (
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
    </main>
  );
}
