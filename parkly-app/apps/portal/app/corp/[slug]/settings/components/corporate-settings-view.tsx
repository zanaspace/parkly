'use client';

import { useState } from 'react';
import { Text } from '@parkly/ui';
import Link from 'next/link';
import type { ResolvedTenant } from '../../data/corporate-tenant';
import { CorporateDriversRoster } from './corporate-drivers-roster';
import { CorporateProfileForm } from './corporate-profile-form';

export function CorporateSettingsView({ tenant, slug }: { tenant: ResolvedTenant; slug: string }) {
  const [activeTab, setActiveTab] = useState<'profile' | 'drivers'>('profile');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Navigation & Breadcrumbs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--pk-color-border-subtle)',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
            }}
          >
            <Link
              href={`/corp/${slug}`}
              style={{
                fontSize: '0.85rem',
                color: 'var(--pk-color-text-secondary)',
                textDecoration: 'none',
              }}
            >
              ← Back to {tenant.legalName} Portal
            </Link>
          </div>
          <Text variant="heading-xl">Corporate Admin Console</Text>
          <Text variant="body-sm" tone="secondary">
            Manage your sovereign branding, legal entity profiles, and WhatsApp-driven field driver
            roster.
          </Text>
        </div>

        {/* Tab Switcher Buttons */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            background: 'var(--pk-color-bg-surface)',
            padding: '0.25rem',
            borderRadius: '8px',
            border: '1px solid var(--pk-color-border-subtle)',
            gap: '0.25rem',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'profile' ? tenant.primaryColor : 'transparent',
              color: activeTab === 'profile' ? '#FFFFFF' : 'var(--pk-color-text-secondary)',
              transition: 'background 0.15s ease',
            }}
          >
            🏢 Organization & Branding
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'drivers'}
            onClick={() => setActiveTab('drivers')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'drivers' ? tenant.primaryColor : 'transparent',
              color: activeTab === 'drivers' ? '#FFFFFF' : 'var(--pk-color-text-secondary)',
              transition: 'background 0.15s ease',
            }}
          >
            🚚 Field Driver Roster & WhatsApp
          </button>
        </div>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'profile' ? (
        <CorporateProfileForm tenant={tenant} slug={slug} />
      ) : (
        <CorporateDriversRoster tenant={tenant} slug={slug} />
      )}
    </div>
  );
}
