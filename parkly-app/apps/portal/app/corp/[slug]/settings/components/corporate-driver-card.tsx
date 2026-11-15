'use client';

import { useState } from 'react';
import { Badge, Button, Input, Select, Text } from '@parkly/ui';
import { publicEnv } from '../../../../../lib/env';
import type { ResolvedTenant } from '../../data/corporate-tenant';
import type { FleetDriver } from './corporate-drivers-roster';

export function CorporateDriverCard({
  driver,
  tenant,
  slug,
  copiedCode,
  joinUrl,
  onCopy,
  onDriverUpdated,
}: {
  driver: FleetDriver;
  tenant: ResolvedTenant;
  slug: string;
  copiedCode: string | null;
  joinUrl: string;
  onCopy: (text: string, id: string) => void;
  onDriverUpdated: (updated: FleetDriver) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [driverName, setDriverName] = useState(driver.driverName);
  const [phone, setPhone] = useState(driver.phone);
  const [vehiclePlate, setVehiclePlate] = useState(driver.vehiclePlate || '');
  const [approvalStatus, setApprovalStatus] = useState(driver.approvalStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getDriverJoinUrl() {
    const params = new URLSearchParams({
      phone: driver.phone,
      code: driver.joinCode,
    });
    return `${joinUrl}?${params.toString()}`;
  }

  function getWhatsAppUrl() {
    const cleanPhone = driver.phone.replace(/[\s\-()+]/g, '');
    const personalizedJoinUrl = getDriverJoinUrl();
    const message = `Hello ${driver.driverName}, you have been added to ${tenant.legalName} corporate transit on Parkly! Use your Join Code: *${driver.joinCode}* to access corporate parking without SMS OTP.\n\nJoin here: ${personalizedJoinUrl}`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${slug}/drivers/${driver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverName: driverName.trim(),
          phone: phone.trim(),
          vehiclePlate: vehiclePlate.trim() ? vehiclePlate.trim().toUpperCase() : null,
          approvalStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update driver');
      }

      const updated = await res.json();
      onDriverUpdated(updated);
      setIsEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating driver');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(status: 'APPROVED' | 'SUSPENDED') {
    try {
      const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${slug}/drivers/${driver.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalStatus: status }),
      });
      if (res.ok) {
        const updated = await res.json();
        onDriverUpdated(updated);
      }
    } catch {
      // ignore
    }
  }

  const isApproved = driver.approvalStatus === 'APPROVED';
  const isPending = driver.approvalStatus === 'PENDING_APPROVAL';

  if (isEditing) {
    return (
      <div
        className="pk-driver-mobile-card"
        style={{ border: '2px solid var(--pk-color-brand-primary, #6366F1)' }}
      >
        <Text variant="heading-sm">Edit Driver Details</Text>
        <Input
          label="Driver Name"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          required
        />
        <Input
          label="Phone Number"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <Input
          label="Vehicle Plate"
          value={vehiclePlate}
          onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
          placeholder="e.g. KJA-482-AA"
        />
        <Select
          label="Approval Status"
          value={approvalStatus}
          onChange={(e) => setApprovalStatus(e.target.value as FleetDriver['approvalStatus'])}
          options={[
            { value: 'APPROVED', label: 'Approved' },
            { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />
        {error && <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{error}</span>}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            marginTop: '0.5rem',
          }}
        >
          <Button variant="primary" size="sm" loading={saving} onClick={() => void handleSave()}>
            Save
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              setDriverName(driver.driverName);
              setPhone(driver.phone);
              setVehiclePlate(driver.vehiclePlate || '');
              setApprovalStatus(driver.approvalStatus);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pk-driver-mobile-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading-sm">{driver.driverName}</Text>
        {isApproved ? (
          <Badge variant="verified">Approved</Badge>
        ) : isPending ? (
          <Badge variant="pending">Pending Approval</Badge>
        ) : (
          <Badge variant="danger">Suspended</Badge>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.85rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <span style={{ color: 'var(--pk-color-text-secondary)' }}>Phone: </span>
          <span>{driver.phone}</span>
        </div>
        <div>
          <span style={{ color: 'var(--pk-color-text-secondary)' }}>Plate: </span>
          {driver.vehiclePlate ? (
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 600,
                background: 'var(--pk-color-bg-surface)',
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
              }}
            >
              {driver.vehiclePlate}
            </span>
          ) : (
            <span style={{ color: 'var(--pk-color-text-tertiary)' }}>No plate</span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--pk-color-bg-surface)',
          padding: '0.5rem 0.75rem',
          borderRadius: '6px',
        }}
      >
        <span style={{ fontSize: '0.8rem', color: 'var(--pk-color-text-secondary)' }}>
          Join Code
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <code style={{ fontWeight: 700, letterSpacing: '0.05em' }}>{driver.joinCode}</code>
          <button
            type="button"
            onClick={() => onCopy(driver.joinCode, driver.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: copiedCode === driver.id ? '#059669' : 'var(--pk-color-text-secondary)',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            {copiedCode === driver.id ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="pk-driver-mobile-actions">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="pk-button pk-button--secondary pk-button--sm"
          style={{ whiteSpace: 'nowrap' }}
        >
          ✏️ Edit
        </button>

        <a
          href={getWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="pk-button pk-button--secondary pk-button--sm"
          style={{
            backgroundColor: '#25D366',
            color: '#FFFFFF',
            borderColor: '#25D366',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          💬 WhatsApp
        </a>

        <button
          type="button"
          onClick={() => onCopy(getDriverJoinUrl(), `link-${driver.id}`)}
          className="pk-button pk-button--secondary pk-button--sm"
          style={{
            color:
              copiedCode === `link-${driver.id}` ? '#10B981' : 'var(--pk-color-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {copiedCode === `link-${driver.id}` ? '✓ Copied' : '🔗 Copy Link'}
        </button>

        {!isApproved ? (
          <button
            type="button"
            onClick={() => handleQuickStatus('APPROVED')}
            className="pk-button pk-button--primary pk-button--sm"
            style={{
              backgroundColor: '#059669',
              borderColor: '#059669',
              whiteSpace: 'nowrap',
            }}
          >
            Approve
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleQuickStatus('SUSPENDED')}
            className="pk-button pk-button--secondary pk-button--sm"
            style={{
              color: '#EF4444',
              borderColor: '#EF4444',
              whiteSpace: 'nowrap',
            }}
          >
            Suspend
          </button>
        )}
      </div>
    </div>
  );
}
