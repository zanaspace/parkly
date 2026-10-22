import type { Metadata, Viewport } from 'next';
import { AttendApp } from '../../components/attend/attend-app';
import { ServiceWorker } from '../../components/attend/service-worker';
import { loadSession } from '../../lib/auth/session';

export const metadata: Metadata = {
  title: 'Parkly Attendant',
  manifest: '/attend.webmanifest',
};
// Brand teal-600; the manifest and browser chrome cannot read CSS tokens.
export const viewport: Viewport = { themeColor: '#137066', width: 'device-width', initialScale: 1 };

/** Doc 03 §3, ADR 0005: the attendant app. Installable; runs offline once set up. */
export default async function AttendPage() {
  const session = await loadSession();
  return (
    <main className="pk-page" data-density="large">
      <ServiceWorker />
      <AttendApp signedIn={session.signedIn} />
    </main>
  );
}
