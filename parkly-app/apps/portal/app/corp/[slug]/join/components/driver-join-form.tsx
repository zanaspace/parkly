'use client';

import { useState } from 'react';
import { Badge, Button, Input, Text } from '@parkly/ui';
import Link from 'next/link';
import { publicEnv } from '../../../../../lib/env';
import type { ResolvedTenant } from '../../data/corporate-tenant';

export function DriverJoinForm({ tenant, slug }: { tenant: ResolvedTenant; slug: string }) {
  const [phone, setPhone] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [joinedDriver, setJoinedDriver] = useState<{
    driverName: string;
    phone: string;
    vehiclePlate: string | null;
    joinCode: string;
    approvalStatus: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${publicEnv().apiUrl}/v1/corp/drivers/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          joinCode: joinCode.trim().toUpperCase(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid join code or phone number');
      }

      const result = await res.json();
      setJoinedDriver(result.driver);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to complete driver join';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (joinedDriver) {
    const isApproved = joinedDriver.approvalStatus === 'APPROVED';

    return (
      <div
        className="pk-card"
        style={{
          maxWidth: '560px',
          margin: '0 auto',
          padding: '2.5rem',
          background: 'var(--pk-color-bg-surface)',
          borderTop: `6px solid ${tenant.primaryColor}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: isApproved ? '#064E3B' : '#78350F',
            color: isApproved ? '#10B981' : '#F59E0B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            margin: '0 auto',
          }}
        >
          {isApproved ? '✓' : '⏳'}
        </div>

        <div>
          <Badge variant={isApproved ? 'verified' : 'pending'} style={{ marginBottom: '0.75rem' }}>
            {isApproved ? 'Approved & Active' : 'Pending Fleet Manager Approval'}
          </Badge>
          <Text variant="heading-lg">Welcome, {joinedDriver.driverName}!</Text>
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ marginTop: '0.5rem', display: 'block' }}
          >
            Your join invitation code has been successfully verified for{' '}
            <strong>{tenant.legalName}</strong>.
          </Text>
        </div>

        <div
          style={{
            background: 'var(--pk-color-bg-canvas)',
            padding: '1.25rem',
            borderRadius: '8px',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            fontSize: '0.875rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--pk-color-text-secondary)' }}>Registered Phone:</span>
            <span style={{ fontWeight: 600 }}>{joinedDriver.phone}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--pk-color-text-secondary)' }}>Assigned Vehicle:</span>
            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {joinedDriver.vehiclePlate || 'Not Assigned'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--pk-color-text-secondary)' }}>Join Verification:</span>
            <span style={{ fontWeight: 600, color: '#059669' }}>Bypassed SMS OTP ✓</span>
          </div>
        </div>

        <Text variant="body-sm" tone="secondary">
          {isApproved
            ? 'Your corporate parking privileges are active. You can pull into designated company lots.'
            : 'Your corporate administrator has been notified to review and approve your account. Once approved, your daily and monthly parking will be covered.'}
        </Text>

        <div
          style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem' }}
        >
          <Link
            href={`/corp/${slug}`}
            className="pk-button pk-button--primary"
            style={{
              backgroundColor: tenant.primaryColor,
              borderColor: tenant.primaryColor,
              textDecoration: 'none',
            }}
          >
            Go to {tenant.legalName} Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pk-card"
      style={{
        maxWidth: '540px',
        margin: '0 auto',
        padding: '2.25rem',
        background: 'var(--pk-color-bg-surface)',
        borderLeft: `4px solid ${tenant.primaryColor}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      <div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}
        >
          <span className="pk-badge pk-badge--brand-subtle">Direct Driver Join</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
            No SMS OTP Required
          </span>
        </div>
        <Text variant="heading-lg">Join {tenant.legalName}</Text>
        <Text variant="body-sm" tone="secondary" style={{ marginTop: '0.35rem', display: 'block' }}>
          Field operators, commercial drivers, and logistics staff: enter your phone number and the
          Join Code received via WhatsApp or fleet coordinator.
        </Text>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            fontSize: '0.875rem',
            background: '#7F1D1D',
            color: '#FECACA',
            border: '1px solid #DC2626',
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
      >
        <Input
          label="Your Registered Phone Number"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+2348012345678"
          helper="The exact phone number where you received your invitation."
          required
        />

        <Input
          label="6-Character Join Code"
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="e.g. ZEN-4821"
          helper="Case-insensitive code generated by your employer."
          style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}
          required
        />

        <div style={{ marginTop: '0.5rem' }}>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            fullWidth
            style={{ backgroundColor: tenant.primaryColor, borderColor: tenant.primaryColor }}
          >
            Verify Code & Access Corporate Parking
          </Button>
        </div>
      </form>

      <div
        style={{
          textAlign: 'center',
          borderTop: '1px solid var(--pk-color-border-subtle)',
          paddingTop: '1rem',
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
          ← Return to {tenant.legalName} Portal Home
        </Link>
      </div>
    </div>
  );
}
