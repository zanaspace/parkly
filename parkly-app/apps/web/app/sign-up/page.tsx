import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BuildingIcon,
  CarIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  TeamIcon,
} from '../../components/icons';
import { resolveAppUrl } from '../../lib/platform-router';

export const metadata: Metadata = { title: 'Sign up · Choose Account Type · Parkly' };

export default function SignUpPage() {
  const operatorUrl = resolveAppUrl('operator', { path: '/sign-up' });
  const corporateUrl = resolveAppUrl('operator', { path: '/corporate/onboarding' });

  const accountTypes = [
    {
      id: 'driver',
      title: 'Daily & Commuter Driver',
      badge: 'Drivers',
      badgeTone: 'default' as const,
      description:
        'Book verified parking spaces, pay upfront with zero touts, or purchase monthly passes.',
      href: '/sign-in',
      isExternal: false,
      ctaText: 'Sign Up as Driver',
      icon: CarIcon,
    },
    {
      id: 'operator',
      title: 'Car Park Operator & Lot Owner',
      badge: 'Operators',
      badgeTone: 'live' as const,
      description:
        'Monetize your parking spaces, get daily cashless bank payouts, and equip attendants with free PWA.',
      href: operatorUrl,
      isExternal: true,
      ctaText: 'Onboard as Operator',
      icon: BuildingIcon,
    },
    {
      id: 'corporate',
      title: 'Corporate Mobility & Fleets',
      badge: 'Enterprise',
      badgeTone: 'verified' as const,
      description:
        'Subsidize employee parking, assign department cost centers, and receive Net-30 monthly invoicing.',
      href: corporateUrl,
      isExternal: true,
      ctaText: 'Setup Corporate Account',
      icon: TeamIcon,
    },
  ];

  return (
    <main className="pk-page pk-stack" style={{ marginBlock: '3rem', maxWidth: '42rem' }}>
      <div className="pk-card pk-stack" style={{ padding: '2.5rem 2rem', borderRadius: '16px' }}>
        <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
          <span className="pk-badge pk-badge--brand-subtle" style={{ marginBottom: '0.5rem' }}>
            Get Started with Parkly
          </span>
          <Text variant="heading-xl" as="h1" style={{ margin: '0.25rem 0' }}>
            How will you use Parkly?
          </Text>
          <Text tone="secondary" style={{ maxWidth: '480px', margin: '0 auto' }}>
            Select your account type to be routed directly to the appropriate registration flow.
          </Text>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {accountTypes.map((type) => {
            const Icon = type.icon;
            return (
              <a
                key={type.id}
                href={type.href}
                className="pk-card"
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.5rem',
                  borderRadius: '12px',
                  border: '1px solid var(--pk-color-border-default)',
                  background: 'var(--pk-color-bg-surface)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: 'var(--pk-color-teal-50, #EEF8F6)',
                      color: 'var(--pk-color-teal-700, #0F5A53)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={24} />
                  </div>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '1.05rem',
                          color: 'var(--pk-color-text-primary)',
                        }}
                      >
                        {type.title}
                      </span>
                      <span
                        className={`pk-badge ${
                          type.badgeTone === 'live'
                            ? 'pk-badge--live'
                            : type.badgeTone === 'verified'
                              ? 'pk-badge--verified'
                              : 'pk-badge--brand-subtle'
                        }`}
                        style={{ fontSize: '0.7rem' }}
                      >
                        {type.badge}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--pk-color-text-secondary)',
                        lineHeight: 1.4,
                        display: 'block',
                        maxWidth: '440px',
                      }}
                    >
                      {type.description}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    color: 'var(--pk-color-teal-600, #137066)',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    marginLeft: '1rem',
                  }}
                >
                  {type.isExternal ? (
                    <ExternalLinkIcon size={20} />
                  ) : (
                    <ChevronRightIcon size={20} />
                  )}
                </div>
              </a>
            );
          })}
        </div>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--pk-color-border-default)',
            textAlign: 'center',
            fontSize: '0.9rem',
            color: 'var(--pk-color-text-secondary)',
          }}
        >
          <span>Already have an account? </span>
          <Link href="/sign-in" className="pk-link" style={{ fontWeight: 600 }}>
            Sign in here
          </Link>
        </div>
      </div>
    </main>
  );
}
