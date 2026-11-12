import { legalUrl } from '../lib/legal-links';

/**
 * Shown at the foot of every portal page, signed in or not (S8 task 8). Operators read the Operator
 * Terms, which also say how their business and team data is handled. The link opens the Parkly
 * website, where the documents live.
 */
export function LegalFooter() {
  return (
    <footer className="pk-site-footer">
      <nav aria-label="Legal" className="pk-site-footer-links">
        <a className="pk-link" href={legalUrl('operators')} target="_blank" rel="noreferrer">
          Operator Terms
        </a>
        <span aria-hidden="true">·</span>
        <a
          className="pk-link"
          href={legalUrl('operators', undefined, 'data')}
          target="_blank"
          rel="noreferrer"
        >
          How we handle your data
        </a>
      </nav>
    </footer>
  );
}
