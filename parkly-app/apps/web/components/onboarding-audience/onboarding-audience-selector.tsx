import { Text } from '@parkly/ui';
import { getPortalUrls } from '../../lib/portal-url';
import { AudienceCard } from './audience-card';
import { AUDIENCE_TIERS } from './audience-data';

export function OnboardingAudienceSelector() {
  const urls = getPortalUrls();

  return (
    <section aria-label="Solutions & Onboarding Packages" style={{ margin: '1rem 0' }}>
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <Text
          variant="overline"
          tone="brand"
          style={{ letterSpacing: '0.08em', display: 'block', marginBottom: '0.25rem' }}
        >
          Ecosystem Onboarding
        </Text>
        <Text variant="heading-xl" as="h2" style={{ marginBottom: '0.5rem' }}>
          Choose Your Parkly Solution
        </Text>
        <Text
          tone="secondary"
          style={{ maxWidth: '600px', margin: '0 auto', display: 'block', fontSize: '0.95rem' }}
        >
          Whether you are parking your car, monetizing a commercial facility, or managing corporate
          transit subsidies, we have a dedicated platform ready for you.
        </Text>
      </div>

      {/* 3-Tier Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          alignItems: 'stretch',
        }}
      >
        {AUDIENCE_TIERS.map((tier) => (
          <AudienceCard key={tier.id} tier={tier} urls={urls} />
        ))}
      </div>

      {/* Institutional / LASPA Concession Trust Callout */}
      <div
        className="pk-card"
        style={{
          marginTop: '1.5rem',
          padding: '1.25rem 1.75rem',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--pk-color-bg-surface)',
          border: '1px dashed var(--pk-color-border-brand, #137066)',
          borderRadius: 'var(--pk-radius-lg, 0.75rem)',
        }}
      >
        <div>
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              color: 'var(--pk-color-text-primary)',
              display: 'block',
            }}
          >
            Government & Municipal Authorities (LASPA / State Concessions)
          </span>
          <span style={{ fontSize: '0.825rem', color: 'var(--pk-color-text-secondary)' }}>
            Looking for municipal street regulation, automated enforcement sync, or audit
            compliance?
          </span>
        </div>
        <a
          href="mailto:concessions@parkly.ng?subject=Municipal%20Tenancy%20Inquiry"
          className="pk-button pk-button--secondary"
          style={{
            textDecoration: 'none',
            fontSize: '0.825rem',
            padding: '0.5rem 1rem',
            whiteSpace: 'nowrap',
          }}
        >
          Contact Concessions Desk
        </a>
      </div>
    </section>
  );
}
