import '@parkly/tokens/css';
import '@parkly/ui/styles.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Parkly · Safe, verified parking in Lagos',
  description: 'Find, book and pay for safe parking in Lagos.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG">
      <body>
        <header className="pk-topbar">
          <Link className="pk-brand" href="/">
            Parkly
          </Link>
          <Link className="pk-link" href="/search">
            Find parking
          </Link>
        </header>
        {children}
        <footer className="pk-footer">
          Parkly lists only car parks with a LASPA permit and a Parkly site visit.
        </footer>
      </body>
    </html>
  );
}
