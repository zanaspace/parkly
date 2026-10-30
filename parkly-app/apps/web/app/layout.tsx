import '@parkly/tokens/css';
import '@parkly/ui/styles.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShieldCheckIcon } from '../components/icons';
import { WebNav } from '../components/web-nav';
import { loadDriver } from '../lib/session';

export const metadata: Metadata = {
  title: 'Parkly · Safe, verified parking in Lagos',
  description: 'Find, book and pay for safe parking in Lagos.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const driver = await loadDriver();

  return (
    <html lang="en-NG">
      <body>
        <WebNav signedIn={!!driver} />
        <div className="pk-app-body">{children}</div>
        <footer className="pk-footer">
          <div className="pk-footer-inner">
            <div className="pk-footer-badge">
              <ShieldCheckIcon size={18} />
              <span>Verified Parking Guarantee</span>
            </div>
            <p className="pk-footer-text">
              Parkly lists only car parks with a LASPA permit and a Parkly site visit.
            </p>
            <div className="pk-footer-links">
              <Link href="/search" className="pk-footer-link">
                Find parking
              </Link>
              <span className="pk-footer-dot">·</span>
              <Link href="/bookings" className="pk-footer-link">
                My bookings
              </Link>
              <span className="pk-footer-dot">·</span>
              <a
                href="https://laspa.lg.gov.ng"
                target="_blank"
                rel="noreferrer"
                className="pk-footer-link"
              >
                LASPA Lagos
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
