import { Text } from '@parkly/ui';
import Link from 'next/link';
import { LogoMarkIcon } from '../../../components/icons';
import { loadSession } from '../../../lib/auth/session';
import { publicEnv } from '../../../lib/env';
import { CorporateOnboardingForm } from './corporate-onboarding-form';

export const metadata = {
  title: 'Corporate Onboarding · Parkly Enterprise',
  description:
    'Self-serve onboarding for employers, enterprise fleets, and corporate transit subsidies.',
};

export default async function CorporateOnboardingPage() {
  const apiUrl = publicEnv().apiUrl;
  const session = await loadSession();
  const currentUser = session.signedIn
    ? { signedIn: true as const, email: session.email }
    : { signedIn: false as const, email: null };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pk-color-bg-canvas)' }}>
      {/* Top navigation */}
      <header
        className="pk-topbar"
        style={{
          borderBottom: '1px solid var(--pk-color-border-default)',
          background: 'var(--pk-color-bg-surface)',
          padding: '0.875rem 1.5rem',
        }}
      >
        <div
          className="pk-topbar-main"
          style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <LogoMarkIcon size={28} />
            <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.3px' }}>
              Parkly{' '}
              <span
                style={{ color: 'var(--pk-color-text-brand)', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Enterprise
              </span>
            </span>
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/sign-in" className="pk-link" style={{ fontSize: '0.9rem' }}>
            Existing Portal Sign In
          </Link>
        </div>
      </header>

      {/* Main onboarding container */}
      <main className="pk-page pk-page--wide" style={{ marginTop: '1rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <span
            className="pk-badge pk-badge--verified"
            style={{ marginBottom: '0.5rem', display: 'inline-block' }}
          >
            Self-Service Enterprise Mobility
          </span>
          <Text variant="heading-xl">Onboard Your Organization</Text>
          <Text
            variant="body-md"
            tone="secondary"
            style={{ marginTop: '0.25rem', maxWidth: '680px', display: 'block' }}
          >
            Create your dedicated corporate parking portal, reserve your sovereign company subdomain
            (<code className="pk-code">yourcompany.parkly.ng</code>), configure department cost
            centers, and enable automated employee subsidies.
          </Text>
        </div>

        <CorporateOnboardingForm apiUrl={apiUrl} currentUser={currentUser} />
      </main>
    </div>
  );
}
