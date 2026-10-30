import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon, LogoMarkIcon } from '../../components/icons';
import { AttendApp } from '../../components/attend/attend-app';
import { PortalNav } from '../../components/portal-nav';
import { ServiceWorker } from '../../components/attend/service-worker';
import { loadMe, loadSession } from '../../lib/auth/session';

export const metadata: Metadata = {
  title: 'Gate Attendant · Parkly',
  manifest: '/attend.webmanifest',
};
// Brand teal-600; the manifest and browser chrome cannot read CSS tokens.
export const viewport: Viewport = { themeColor: '#137066', width: 'device-width', initialScale: 1 };

/** Doc 03 §3, ADR 0005: the attendant app. Installable; runs offline once set up. */
export default async function AttendPage() {
  const session = await loadSession();
  const signedIn = session.signedIn;
  let isOwner = false;
  let user: { name: string; role: string; email?: string } | undefined;

  if (signedIn) {
    const me = await loadMe(session.accessToken).catch(() => null);
    if (me) {
      isOwner = me.roles.some((r) => r.role === 'OPERATOR_OWNER');
      const primaryRole =
        me.roles.find((r) => r.role === 'OPERATOR_OWNER')?.role ??
        me.roles.find((r) => r.role === 'OPERATOR_MANAGER')?.role ??
        me.roles[0]?.role ??
        'OPERATOR';
      const roleLabel =
        primaryRole === 'OPERATOR_OWNER'
          ? 'Owner'
          : primaryRole === 'OPERATOR_MANAGER'
            ? 'Manager'
            : 'Attendant';
      user = {
        name: [me.firstName, me.lastName].filter(Boolean).join(' ') || 'Operator',
        role: roleLabel,
        email: session.email ?? undefined,
      };
    } else {
      user = {
        name: (session.email ? session.email.split('@')[0] : '') || 'Operator',
        role: 'Operator',
        email: session.email ?? undefined,
      };
    }
  }

  return (
    <div className="pk-attend-wrapper">
      {/* Topbar for the Gate App */}
      <header className="pk-topbar">
        <div className="pk-topbar-main">
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
            }}
          >
            <LogoMarkIcon size={26} />
            <span
              style={{
                fontWeight: '700',
                letterSpacing: '-0.3px',
                fontSize: '1.05rem',
                color: 'var(--pk-color-text-brand)',
              }}
            >
              Parkly Ops
            </span>
          </Link>
          <span
            className="pk-badge pk-badge--live"
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
          >
            Gate Attendant
          </span>
          <PortalNav isOwner={isOwner} user={user} />
        </div>
        <div className="pk-topbar-user pk-row" style={{ gap: '0.75rem' }}>
          <Link href="/" className="pk-back-link">
            <ArrowLeftIcon size={16} />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </header>

      {/* Main Gate Scanner Screen */}
      <main className="pk-attend-page" data-density="large">
        <ServiceWorker />
        <div className="pk-attend-container">
          {/* Card Top Navigation Breadcrumb */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--pk-color-border-subtle)',
            }}
          >
            <Link href="/" className="pk-back-link">
              <ArrowLeftIcon size={16} />
              <span>Exit to Dashboard</span>
            </Link>
            <span
              className="pk-badge pk-badge--verified"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}
            >
              Gate Mode
            </span>
          </div>

          <AttendApp signedIn={signedIn} />
        </div>
      </main>
    </div>
  );
}
