import { Text } from '@parkly/ui';
import Link from 'next/link';
import { fill } from '../lib/legal/entity';
import type { Block, LegalDoc } from '../lib/legal/types';

function Blocks({ blocks, version }: { blocks: Block[]; version: string }) {
  const say = (t: string) => fill(t.replaceAll('{{version}}', version));
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'p') return <p key={i}>{say(b.text)}</p>;
        if (b.kind === 'note')
          return (
            <p key={i} className="pk-legal-note">
              {say(b.text)}
            </p>
          );
        if (b.kind === 'ul')
          return (
            <ul key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{say(item)}</li>
              ))}
            </ul>
          );
        return (
          <div key={i} className="pk-table-wrap">
            <table className="pk-legal-table">
              {b.caption ? <caption>{b.caption}</caption> : null}
              <thead>
                <tr>
                  {b.head.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) =>
                      c === 0 ? (
                        <th key={c} scope="row">
                          {say(cell)}
                        </th>
                      ) : (
                        <td key={c}>{say(cell)}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

/** One legal document: the title, which version it is, a contents list, and every section. */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <main className="pk-page pk-legal">
      <Link className="pk-link" href="/legal">
        ← Legal
      </Link>
      <div>
        <Text variant="heading-xl" as="h1">
          {doc.title}
        </Text>
        <Text tone="secondary">{doc.summary}</Text>
        <Text variant="body-sm" tone="tertiary">
          Version {doc.version} · Last updated {doc.updated}
        </Text>
      </div>

      {doc.draft ? (
        <p className="pk-notice pk-notice--info" role="note">
          This is a draft that a lawyer has not yet reviewed. It is not final and is not yet in
          force.
        </p>
      ) : null}

      <nav aria-label="In this document" className="pk-card">
        <Text variant="label-lg" as="h2">
          In this document
        </Text>
        <ol className="pk-legal-toc">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a className="pk-link" href={`#${s.id}`}>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((s, n) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="pk-legal-section">
          <Text variant="heading-lg" as="h2" id={`${s.id}-h`}>
            {n + 1}. {s.title}
          </Text>
          <Blocks blocks={s.blocks} version={doc.version} />
        </section>
      ))}
    </main>
  );
}
