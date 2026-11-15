import { Text } from '@parkly/ui';
import Link from 'next/link';
import type { PortalUrls } from '../../lib/portal-url';
import {
  BuildingIcon,
  CarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  TeamIcon,
} from '../icons';
import type { AudienceTier } from './audience-data';

export function AudienceCard({ tier, urls }: { tier: AudienceTier; urls: PortalUrls }) {
  const Icon =
    tier.iconName === 'car' ? CarIcon : tier.iconName === 'building' ? BuildingIcon : TeamIcon;

  const primaryUrl = tier.primaryCta.href(urls);
  const secondaryUrl = tier.secondaryCta ? tier.secondaryCta.href(urls) : null;

  return (
    <div
      className="pk-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.75rem',
        borderRadius: 'var(--pk-radius-lg, 0.75rem)',
        background: 'var(--pk-color-bg-surface)',
        border: '1px solid var(--pk-color-border-default)',
        position: 'relative',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div>
        {/* Tier Header with Icon and Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--pk-color-teal-50, #EEF8F6)',
              color: 'var(--pk-color-teal-700, #0F5A53)',
            }}
          >
            <Icon size={22} />
          </div>
          <span
            className={`pk-badge ${
              tier.badgeTone === 'live'
                ? 'pk-badge--live'
                : tier.badgeTone === 'verified'
                  ? 'pk-badge--verified'
                  : 'pk-badge--brand-subtle'
            }`}
          >
            {tier.badge}
          </span>
        </div>

        {/* Title and Description */}
        <Text variant="heading-md" as="h3" style={{ marginBottom: '0.35rem' }}>
          {tier.title}
        </Text>
        <Text
          variant="body-sm"
          tone="secondary"
          style={{ marginBottom: '1.5rem', minHeight: '2.5rem', display: 'block' }}
        >
          {tier.subtitle}
        </Text>

        {/* Features List */}
        <ul
          style={{
            margin: '0 0 1.75rem 0',
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
          }}
        >
          {tier.features.map((feature) => (
            <li
              key={feature}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.625rem',
                fontSize: '0.85rem',
                color: 'var(--pk-color-text-secondary)',
                lineHeight: 1.4,
              }}
            >
              <span
                style={{
                  color: 'var(--pk-color-teal-600, #137066)',
                  flexShrink: 0,
                  marginTop: '0.125rem',
                }}
              >
                <CheckCircleIcon size={16} />
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <Link
          href={primaryUrl}
          className="pk-button pk-button--primary"
          style={{
            textDecoration: 'none',
            justifyContent: 'center',
            width: '100%',
            fontWeight: 600,
          }}
        >
          <span>{tier.primaryCta.label}</span>
          {tier.primaryCta.isExternal ? (
            <ExternalLinkIcon size={15} style={{ marginLeft: '0.35rem' }} />
          ) : (
            <ChevronRightIcon size={15} style={{ marginLeft: '0.35rem' }} />
          )}
        </Link>

        {secondaryUrl && tier.secondaryCta && (
          <Link
            href={secondaryUrl}
            className="pk-button pk-button--ghost"
            style={{
              textDecoration: 'none',
              justifyContent: 'center',
              width: '100%',
              fontSize: '0.825rem',
            }}
          >
            <span>{tier.secondaryCta.label}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
