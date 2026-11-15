'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Input, Text } from '@parkly/ui';
import { publicEnv } from '../../../../../lib/env';
import type { ResolvedTenant } from '../../data/corporate-tenant';

export function DriverJoinForm({
  tenant,
  initialPhone = '',
  initialCode = '',
}: {
  tenant: ResolvedTenant;
  slug?: string;
  initialPhone?: string;
  initialCode?: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [joinCode, setJoinCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPhone && !phone) setPhone(initialPhone);
  }, [initialPhone]);

  useEffect(() => {
    if (initialCode && !joinCode) setJoinCode(initialCode.toUpperCase());
  }, [initialCode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const urlPhone = sp.get('phone');
      const urlCode = sp.get('code') || sp.get('joinCode');
      if (urlPhone && !phone) setPhone(urlPhone);
      if (urlCode && !joinCode) setJoinCode(urlCode.toUpperCase());
    }
  }, []);

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
        className="pk-join-card"
        style={{
          borderTop: `6px solid ${tenant.primaryColor}`,
          textAlign: 'center',
          alignItems: 'center',
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
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.25rem',
            }}
          >
            <span style={{ color: 'var(--pk-color-text-secondary)' }}>Registered Phone:</span>
            <span style={{ fontWeight: 600 }}>{joinedDriver.phone}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.25rem',
            }}
          >
            <span style={{ color: 'var(--pk-color-text-secondary)' }}>Assigned Vehicle:</span>
            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {joinedDriver.vehiclePlate || 'Not Assigned'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.25rem',
            }}
          >
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
          style={{
            marginTop: '0.5rem',
            padding: '1rem',
            borderRadius: '8px',
            background: 'var(--pk-color-bg-canvas)',
            border: '1px solid var(--pk-color-border-subtle)',
            textAlign: 'center',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Text variant="body-sm" tone="secondary">
            {isApproved
              ? 'You are all set! Show your phone number or vehicle plate to the car park attendant at the gate.'
              : 'Keep your phone handy. Your fleet coordinator will activate your access shortly.'}
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pk-join-card"
      style={{
        borderLeft: `4px solid ${tenant.primaryColor}`,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <span className="pk-badge pk-badge--brand-subtle">Direct Driver Join</span>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--pk-color-text-secondary)',
              fontWeight: 500,
            }}
          >
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
          helper={
            phone
              ? 'Your employer-linked phone number. Pre-filled from your corporate invite.'
              : 'The exact phone number where you received your invitation.'
          }
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
            Verify & Access Corporate Parking
          </Button>
        </div>
      </form>
    </div>
  );
}
