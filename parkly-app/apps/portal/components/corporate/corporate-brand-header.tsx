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
        padding: '0.75rem 1rem',
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        className="pk-topbar-main"
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}
      >
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt={`${legalName} Logo`}
            style={{
              height: '32px',
              maxWidth: '110px',
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: primaryColor,
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              letterSpacing: '-0.5px',
              flexShrink: 0,
            }}
          >
            {legalName.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'nowrap' }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'var(--pk-color-text-primary)',
                letterSpacing: '-0.2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {legalName}
            </span>
            <span
              className="pk-badge pk-badge--verified"
              style={{
                fontSize: '0.65rem',
                padding: '0.1rem 0.4rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Verified
            </span>
          </div>
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--pk-color-text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {portalTitle}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {welcomeMessage && <span className="pk-corp-welcome-desktop">{welcomeMessage}</span>}
        <div className="pk-corp-partner-badge">
          <LogoMarkIcon size={18} />
          <span
            className="pk-corp-partner-text"
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--pk-color-text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            Parkly Corporate
          </span>
        </div>
      </div>
    </header>
  );
}
