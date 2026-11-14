'use client';

import { Text } from '@parkly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircleIcon } from '../../../../components/icons';
import type { OnboardingResult } from '../data/onboarding-api';

export function SuccessModal({ tenant }: { tenant: OnboardingResult }) {
  const router = useRouter();

  return (
    <div
      className="pk-card"
      style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '640px', margin: '2rem auto' }}
    >
      <div
        style={{
          display: 'inline-flex',
          padding: '1rem',
          borderRadius: '50%',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          color: '#10B981',
          marginBottom: '1.25rem',
        }}
      >
        <CheckCircleIcon size={48} />
      </div>
      <Text variant="heading-xl">Corporate Subdomain Created!</Text>
      <Text
        variant="body-md"
        tone="secondary"
        style={{ marginTop: '0.5rem', marginBottom: '1.5rem', display: 'block' }}
      >
        <strong>{tenant.legalName}</strong> is now registered on Parkly Corporate. Your sovereign
        dedicated subdomain and employee SSO directory are active.
      </Text>

      <div
        className="pk-card"
        style={{
          background: 'var(--pk-color-bg-canvas)',
          padding: '1.25rem',
          marginBottom: '1.75rem',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--pk-color-text-secondary)',
            marginBottom: '0.25rem',
          }}
        >
          Dedicated Tenant URL
        </div>
        <code className="pk-code" style={{ fontSize: '1rem', color: 'var(--pk-color-text-brand)' }}>
          https://{tenant.slug}.parkly.ng
        </code>
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="pk-button pk-button--primary pk-button--lg"
          onClick={() => router.push(`/corp/${tenant.slug}`)}
        >
          Launch Branded Tenant Portal →
        </button>
        <Link
          href="/onboarding"
          className="pk-button pk-button--secondary pk-button--lg"
          style={{ textDecoration: 'none' }}
        >
          Go to Admin Overview
        </Link>
      </div>
    </div>
  );
}
