'use client';

import { useState } from 'react';
import { Button, Input, Text } from '@parkly/ui';
import { publicEnv } from '../../../../../lib/env';
import type { ResolvedTenant } from '../../data/corporate-tenant';

const PRESET_COLORS = [
  { label: 'Crimson Red', hex: '#E31837' },
  { label: 'Parkly Emerald', hex: '#00C48C' },
  { label: 'Zenith Navy', hex: '#00338D' },
  { label: 'Dangote Forest', hex: '#006A4E' },
  { label: 'Access Orange', hex: '#F58220' },
  { label: 'Tech Indigo', hex: '#4F46E5' },
];

export function CorporateProfileForm({ tenant, slug }: { tenant: ResolvedTenant; slug: string }) {
  const [legalName, setLegalName] = useState(tenant.legalName);
  const [cacRcNumber, setCacRcNumber] = useState(tenant.cacRcNumber || '');
  const [industry, setIndustry] = useState(tenant.industry);
  const [headOfficeAddress, setHeadOfficeAddress] = useState(tenant.headOfficeAddress || '');
  const [primaryContactName, setPrimaryContactName] = useState(tenant.primaryContactName || '');
  const [primaryContactEmail, setPrimaryContactEmail] = useState(tenant.primaryContactEmail || '');
  const [primaryContactPhone, setPrimaryContactPhone] = useState(tenant.primaryContactPhone || '');
  const [emailDomain, setEmailDomain] = useState(tenant.emailDomain || '');

  const [portalTitle, setPortalTitle] = useState(tenant.portalTitle);
  const [welcomeMessage, setWelcomeMessage] = useState(tenant.welcomeMessage || '');
  const [primaryColor, setPrimaryColor] = useState(tenant.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(tenant.secondaryColor);
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl || '');

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      const payload = {
        legalName: legalName.trim(),
        cacRcNumber: cacRcNumber.trim(),
        industry: industry.trim(),
        headOfficeAddress: headOfficeAddress.trim(),
        primaryContactName: primaryContactName.trim(),
        primaryContactEmail: primaryContactEmail.trim(),
        primaryContactPhone: primaryContactPhone.trim(),
        emailDomain: emailDomain.trim().replace(/^@/, '') || undefined,
        branding: {
          logoUrl: logoUrl.trim() || undefined,
          primaryColor: primaryColor.trim(),
          secondaryColor: secondaryColor.trim(),
          portalTitle: portalTitle.trim(),
          welcomeMessage: welcomeMessage.trim() || null,
        },
      };

      const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update corporate profile');
      }

      setStatusMsg({
        type: 'success',
        text: 'Corporate profile & sovereign branding updated successfully!',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setStatusMsg({ type: 'error', text: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {statusMsg && (
        <div
          role="alert"
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 500,
            background: statusMsg.type === 'success' ? '#064E3B' : '#7F1D1D',
            color: statusMsg.type === 'success' ? '#A7F3D0' : '#FECACA',
            border: `1px solid ${statusMsg.type === 'success' ? '#059669' : '#DC2626'}`,
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* 1. Legal Entity & Operations Details */}
      <section
        className="pk-card"
        style={{
          background: 'var(--pk-color-bg-surface)',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div>
          <Text variant="heading-md">Enterprise Legal & Operations</Text>
          <Text variant="body-sm" tone="secondary">
            Registered corporate entity information for tax invoicing and pass administration.
          </Text>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}
        >
          <Input
            label="Corporate Legal Name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            required
          />
          <Input
            label="CAC / RC Registration Number"
            value={cacRcNumber}
            onChange={(e) => setCacRcNumber(e.target.value)}
            required
          />
          <Input
            label="Industry Sector"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            required
          />
          <Input
            label="Head Office Address"
            value={headOfficeAddress}
            onChange={(e) => setHeadOfficeAddress(e.target.value)}
            required
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem',
            marginTop: '0.5rem',
          }}
        >
          <Input
            label="Fleet / Transit Administrator Name"
            value={primaryContactName}
            onChange={(e) => setPrimaryContactName(e.target.value)}
            required
          />
          <Input
            label="Official Contact Email"
            type="email"
            value={primaryContactEmail}
            onChange={(e) => setPrimaryContactEmail(e.target.value)}
            required
          />
          <Input
            label="Primary Phone Number"
            value={primaryContactPhone}
            onChange={(e) => setPrimaryContactPhone(e.target.value)}
            required
          />
          <Input
            label="Authorized Email Domain"
            value={emailDomain}
            onChange={(e) => setEmailDomain(e.target.value)}
            helper="Staff with this domain (@domain) auto-verify via Employee SSO."
            placeholder="e.g. sellyticshq.com"
            required
          />
        </div>
      </section>

      {/* 2. Sovereign Branding & Theme */}
      <section
        className="pk-card"
        style={{
          background: 'var(--pk-color-bg-surface)',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div>
          <Text variant="heading-md">Sovereign Portal Branding & Theme</Text>
          <Text variant="body-sm" tone="secondary">
            Custom colors, banners, and logos displayed to your employees and drivers.
          </Text>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}
        >
          <Input
            label="Portal Title Header"
            value={portalTitle}
            onChange={(e) => setPortalTitle(e.target.value)}
            required
          />
          <Input
            label="Logo URL (PNG / SVG)"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://yourcompany.com/logo.png"
          />
        </div>

        <div className="pk-field">
          <label className="pk-field__label">Welcome Announcement / Driver Note</label>
          <textarea
            className="pk-input"
            rows={3}
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            placeholder="Message displayed in portal banner to staff and drivers"
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        {/* Color Palette Selector */}
        <div>
          <Text
            variant="body-sm"
            style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}
          >
            Primary Theme Brand Color
          </Text>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
              marginBottom: '0.75rem',
            }}
          >
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => setPrimaryColor(preset.hex)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border:
                    primaryColor.toLowerCase() === preset.hex.toLowerCase()
                      ? '2px solid white'
                      : '1px solid var(--pk-color-border-subtle)',
                  background: 'var(--pk-color-bg-canvas)',
                  cursor: 'pointer',
                  color: 'var(--pk-color-text-primary)',
                  fontSize: '0.8rem',
                }}
              >
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: preset.hex,
                  }}
                />
                {preset.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              maxWidth: '380px',
            }}
          >
            <Input
              label="Primary Hex Code"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              required
            />
            <Input
              label="Secondary Hex Code"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Live Brand Theme Preview */}
        <div
          style={{
            padding: '1.25rem',
            borderRadius: '8px',
            background: 'var(--pk-color-bg-canvas)',
            borderLeft: `4px solid ${primaryColor}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: primaryColor,
                color: '#fff',
                fontWeight: 600,
                display: 'inline-block',
                marginBottom: '0.35rem',
              }}
            >
              LIVE PREVIEW
            </span>
            <Text variant="heading-sm">{portalTitle || 'Corporate Transit'}</Text>
            <Text variant="body-sm" tone="secondary">
              {welcomeMessage || 'Authorized parking access'}
            </Text>
          </div>
          <div
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              backgroundColor: primaryColor,
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Sample Action Button
          </div>
        </div>
      </section>

      <div>
        <Button type="submit" variant="primary" loading={saving} size="lg">
          Save Corporate Profile & Branding
        </Button>
      </div>
    </form>
  );
}
