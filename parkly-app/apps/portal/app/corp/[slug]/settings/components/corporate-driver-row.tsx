'use client';

import { useState } from 'react';
import { Badge, Button, Input, Select } from '@parkly/ui';
import { publicEnv } from '../../../../../lib/env';
import type { ResolvedTenant } from '../../data/corporate-tenant';
import type { FleetDriver } from './corporate-drivers-roster';

export function CorporateDriverRow({
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

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
      <tr
        style={{
          borderBottom: '2px solid var(--pk-color-brand-primary, #6366F1)',
          background: 'var(--pk-color-bg-surface)',
        }}
      >
        <td style={{ padding: '0.75rem 0.5rem' }}>
          <Input
            label="Driver Name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Driver Name"
            required
          />
        </td>
        <td style={{ padding: '0.75rem 0.5rem' }}>
          <Input
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234..."
            required
          />
        </td>
        <td style={{ padding: '0.75rem 0.5rem' }}>
          <Input
            label="Vehicle Plate"
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
            placeholder="e.g. KJA-482-AA"
          />
        </td>
        <td style={{ padding: '0.75rem 0.5rem' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{driver.joinCode}</span>
        </td>
        <td style={{ padding: '0.75rem 0.5rem' }}>
          <Select
            label="Status"
            value={approvalStatus}
            onChange={(e) => setApprovalStatus(e.target.value as FleetDriver['approvalStatus'])}
            options={[
              { value: 'APPROVED', label: 'Approved' },
              { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ]}
          />
        </td>
        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            {error && <span style={{ color: '#EF4444', fontSize: '0.75rem' }}>{error}</span>}
            <Button size="sm" variant="primary" loading={saving} onClick={() => void handleSave()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="secondary"
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
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--pk-color-border-subtle)' }}>
      <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600 }}>{driver.driverName}</td>
      <td style={{ padding: '0.85rem 0.5rem', color: 'var(--pk-color-text-secondary)' }}>
        {driver.phone}
      </td>
      <td style={{ padding: '0.85rem 0.5rem' }}>
        {driver.vehiclePlate ? (
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 600,
              background: 'var(--pk-color-bg-canvas)',
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
            }}
          >
            {driver.vehiclePlate}
          </span>
        ) : (
          <span style={{ color: 'var(--pk-color-text-tertiary)', fontSize: '0.8rem' }}>
            No plate set
          </span>
        )}
      </td>
      <td style={{ padding: '0.85rem 0.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              background: 'var(--pk-color-bg-canvas)',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              letterSpacing: '0.05em',
            }}
          >
            {driver.joinCode}
          </span>
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
      </td>
      <td style={{ padding: '0.85rem 0.5rem' }}>
        {isApproved ? (
          <Badge variant="verified">Approved</Badge>
        ) : isPending ? (
          <Badge variant="pending">Pending Approval</Badge>
        ) : (
          <Badge variant="danger">Suspended</Badge>
        )}
      </td>
      <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            alignItems: 'center',
            minWidth: '300px',
            whiteSpace: 'nowrap',
          }}
        >
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="pk-button pk-button--secondary pk-button--sm"
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.6rem',
              color: 'var(--pk-color-text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            ✏️ Edit
          </button>

          <a
            href={getWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="pk-button pk-button--secondary pk-button--sm"
            style={{
              textDecoration: 'none',
              backgroundColor: '#25D366',
              color: '#FFFFFF',
              borderColor: '#25D366',
              fontSize: '0.75rem',
              padding: '0.25rem 0.6rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            💬 WhatsApp Invite
          </a>

          <button
            type="button"
            onClick={() => onCopy(getDriverJoinUrl(), `link-${driver.id}`)}
            className="pk-button pk-button--secondary pk-button--sm"
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.6rem',
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
                fontSize: '0.75rem',
                padding: '0.25rem 0.6rem',
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
                fontSize: '0.75rem',
                padding: '0.25rem 0.6rem',
                color: '#EF4444',
                borderColor: '#EF4444',
                whiteSpace: 'nowrap',
              }}
            >
              Suspend
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
