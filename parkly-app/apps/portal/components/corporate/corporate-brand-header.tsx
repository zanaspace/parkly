import React from 'react';
import { LogoMarkIcon } from '../icons';

export type CorporateBrandHeaderProps = {
  legalName: string;
  portalTitle: string;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  welcomeMessage?: string | null;
};

export function CorporateBrandHeader({
  legalName,
  portalTitle,
  logoUrl,
  primaryColor = '#E31837',
  welcomeMessage,
}: CorporateBrandHeaderProps) {
  return (
    <header
      className="pk-topbar"
      style={{
        borderBottom: `2px solid ${primaryColor}`,
        background: 'var(--pk-color-bg-surface)',
        padding: '0.875rem 1.5rem',
      }}
    >
      <div className="pk-topbar-main" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt={`${legalName} Logo`}
            style={{ height: '36px', maxWidth: '140px', objectFit: 'contain' }}
          />
        ) : (
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: primaryColor,
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              letterSpacing: '-0.5px',
            }}
          >
            {legalName.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: '1.05rem',
                color: 'var(--pk-color-text-primary)',
                letterSpacing: '-0.2px',
              }}
            >
              {legalName}
            </span>
            <span className="pk-badge pk-badge--verified" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
              Verified Enterprise
            </span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--pk-color-text-secondary)' }}>
            {portalTitle}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        {welcomeMessage && (
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--pk-color-text-muted)',
              maxWidth: '380px',
              textAlign: 'right',
              lineHeight: 1.3,
            }}
          >
            {welcomeMessage}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--pk-color-border-default)', paddingLeft: '1rem' }}>
          <LogoMarkIcon size={20} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--pk-color-text-secondary)' }}>
            Parkly Corporate
          </span>
        </div>
      </div>
    </header>
  );
}
