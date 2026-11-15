'use client';

import { useEffect, useState } from 'react';
import { Text } from '@parkly/ui';
import { publicEnv } from '../../../../../lib/env';
import { getTenantUrl } from '../../../../../lib/tenant-url';
import type { ResolvedTenant } from '../../data/corporate-tenant';
import { CorporateAddDriverForm } from './corporate-add-driver-form';
import { CorporateDriverCard } from './corporate-driver-card';
import { CorporateDriverRow } from './corporate-driver-row';

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
            gap: '0.75rem',
          }}
        >
          <div>
            <Text variant="heading-md">Field & Fleet Driver Directory</Text>
            <Text variant="body-sm" tone="secondary">
              Review and edit registered drivers, assign vehicle plate numbers, dispatch WhatsApp
              invites, and manage gate check-in status.
            </Text>
          </div>
          <span className="pk-badge pk-badge--brand-subtle">
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
          <>
            {/* Desktop Table View */}
            <div className="pk-driver-table-desktop">
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
                    <th style={{ padding: '0.75rem 0.5rem' }}>Plate Number</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Join Code</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) => (
                    <CorporateDriverRow
                      key={driver.id}
                      driver={driver}
                      tenant={tenant}
                      slug={slug}
                      copiedCode={copiedCode}
                      joinUrl={joinUrl}
                      onCopy={handleCopy}
                      onDriverUpdated={(updated) =>
                        setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View */}
            <div className="pk-driver-cards-mobile">
              {drivers.map((driver) => (
                <CorporateDriverCard
                  key={driver.id}
                  driver={driver}
                  tenant={tenant}
                  slug={slug}
                  copiedCode={copiedCode}
                  joinUrl={joinUrl}
                  onCopy={handleCopy}
                  onDriverUpdated={(updated) =>
                    setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
                  }
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
