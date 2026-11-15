'use client';

import { useEffect, useState } from 'react';
import { Badge, Text } from '@parkly/ui';
import { publicEnv } from '../../../../../lib/env';
import { getTenantUrl } from '../../../../../lib/tenant-url';
import type { ResolvedTenant } from '../../data/corporate-tenant';
import { CorporateAddDriverForm } from './corporate-add-driver-form';

export type FleetDriver = {
  id: string;
  corporateId: string;
  driverName: string;
  phone: string;
  vehiclePlate: string | null;
  joinCode: string;
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED';
  isActive: boolean;
  createdAt: string;
};

export function CorporateDriversRoster({ tenant, slug }: { tenant: ResolvedTenant; slug: string }) {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const tenantUrlInfo = getTenantUrl(slug);
  const joinUrl = `${tenantUrlInfo.activeUrl}/join`;

  useEffect(() => {
    fetchDrivers();
  }, [slug]);

  async function fetchDrivers() {
    setLoading(true);
    try {
      const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${slug}/drivers`);
      if (res.ok) {
        const data = await res.json();
        setDrivers(data);
      } else {
        setDrivers([
          {
            id: 'mock-1',
            corporateId: tenant.id || 'demo',
            driverName: 'Ibrahim Musa',
            phone: '+2348031234567',
            vehiclePlate: 'KJA-482-AA',
            joinCode: `${slug.slice(0, 3).toUpperCase()}-4821`,
            approvalStatus: 'APPROVED',
            isActive: true,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'mock-2',
            corporateId: tenant.id || 'demo',
            driverName: 'Chinedu Eze',
            phone: '+2348098765432',
            vehiclePlate: 'APP-902-LK',
            joinCode: `${slug.slice(0, 3).toUpperCase()}-9102`,
            approvalStatus: 'PENDING_APPROVAL',
            isActive: true,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(driverId: string, status: 'APPROVED' | 'SUSPENDED') {
    try {
      const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${slug}/drivers/${driverId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalStatus: status }),
      });

      if (res.ok) {
        setDrivers((prev) =>
          prev.map((d) => (d.id === driverId ? { ...d, approvalStatus: status } : d)),
        );
      }
    } catch {
      // ignore
    }
  }

  function getDriverJoinUrl(driver: FleetDriver) {
    const params = new URLSearchParams({
      phone: driver.phone,
      code: driver.joinCode,
    });
    return `${joinUrl}?${params.toString()}`;
  }

  function getWhatsAppUrl(driver: FleetDriver) {
    const cleanPhone = driver.phone.replace(/[\s\-()+]/g, '');
    const personalizedJoinUrl = getDriverJoinUrl(driver);
    const message = `Hello ${driver.driverName}, you have been added to ${tenant.legalName} corporate transit on Parkly! Use your Join Code: *${driver.joinCode}* to access corporate parking without SMS OTP.\n\nJoin here: ${personalizedJoinUrl}`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  function handleCopy(text: string, code: string) {
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. Add Driver Form */}
      <CorporateAddDriverForm
        slug={slug}
        primaryColor={tenant.primaryColor}
        onDriverAdded={(newDriver) => setDrivers((prev) => [newDriver, ...prev])}
      />

      {/* 2. Driver Roster Table */}
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <Text variant="heading-md">Field Driver Roster & WhatsApp Invites</Text>
            <Text variant="body-sm" tone="secondary">
              Review registered drivers, dispatch WhatsApp join invites, and approve corporate pass
              access.
            </Text>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--pk-color-text-secondary)' }}>
            Total Roster: {drivers.length} drivers
          </span>
        </div>

        {loading ? (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--pk-color-text-secondary)',
            }}
          >
            Loading driver roster...
          </div>
        ) : drivers.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--pk-color-text-secondary)',
            }}
          >
            No field drivers added yet. Use the form above to onboard your first driver.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.9rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--pk-color-border-subtle)',
                    color: 'var(--pk-color-text-secondary)',
                  }}
                >
                  <th style={{ padding: '0.75rem 0.5rem' }}>Driver Name</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Phone Number</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Plate</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Join Code</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => {
                  const isApproved = driver.approvalStatus === 'APPROVED';
                  const isPending = driver.approvalStatus === 'PENDING_APPROVAL';

                  return (
                    <tr
                      key={driver.id}
                      style={{ borderBottom: '1px solid var(--pk-color-border-subtle)' }}
                    >
                      <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600 }}>
                        {driver.driverName}
                      </td>
                      <td
                        style={{
                          padding: '0.85rem 0.5rem',
                          color: 'var(--pk-color-text-secondary)',
                        }}
                      >
                        {driver.phone}
                      </td>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        {driver.vehiclePlate ? (
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {driver.vehiclePlate}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--pk-color-text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <div
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
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
                            onClick={() => handleCopy(driver.joinCode, driver.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color:
                                copiedCode === driver.id
                                  ? '#059669'
                                  : 'var(--pk-color-text-secondary)',
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
                      <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            justifyContent: 'flex-end',
                            flexWrap: 'wrap',
                          }}
                        >
                          <a
                            href={getWhatsAppUrl(driver)}
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
                            }}
                          >
                            💬 WhatsApp Invite
                          </a>

                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(getDriverJoinUrl(driver), `link-${driver.id}`)
                            }
                            className="pk-button pk-button--secondary pk-button--sm"
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.6rem',
                              color:
                                copiedCode === `link-${driver.id}`
                                  ? '#10B981'
                                  : 'var(--pk-color-text-secondary)',
                            }}
                          >
                            {copiedCode === `link-${driver.id}` ? '✓ Copied' : '🔗 Copy Link'}
                          </button>

                          {!isApproved ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(driver.id, 'APPROVED')}
                              className="pk-button pk-button--primary pk-button--sm"
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.6rem',
                                backgroundColor: '#059669',
                                borderColor: '#059669',
                              }}
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(driver.id, 'SUSPENDED')}
                              className="pk-button pk-button--ghost pk-button--sm"
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.6rem',
                                color: '#DC2626',
                              }}
                            >
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
