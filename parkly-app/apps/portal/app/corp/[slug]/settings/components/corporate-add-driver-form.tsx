'use client';

import { useState } from 'react';
import { Button, Input, Text } from '@parkly/ui';
import { publicEnv } from '../../../../../lib/env';
import type { FleetDriver } from './corporate-drivers-roster';

export function CorporateAddDriverForm({
  slug,
  primaryColor,
  onDriverAdded,
}: {
  slug: string;
  primaryColor: string;
  onDriverAdded: (driver: FleetDriver) => void;
}) {
  const [driverName, setDriverName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAddDriver(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);

    try {
      const res = await fetch(`${publicEnv().apiUrl}/v1/corp/${slug}/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverName: driverName.trim(),
          phone: phone.trim(),
          vehiclePlate: vehiclePlate.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to add driver');
      }

      const created = await res.json();
      onDriverAdded(created);
      setDriverName('');
      setPhone('');
      setVehiclePlate('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error adding driver';
      setFormError(msg);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section
      className="pk-card"
      style={{
        background: 'var(--pk-color-bg-surface)',
        padding: '1.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        borderLeft: `4px solid ${primaryColor}`,
      }}
    >
      <div>
        <Text variant="heading-md">Add Field Operator or Truck Driver</Text>
        <Text variant="body-sm" tone="secondary">
          Bypass SMS OTP delays for drivers without corporate emails. The system generates a Join
          Code and WhatsApp invite link.
        </Text>
      </div>

      {formError && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            fontSize: '0.875rem',
            background: '#7F1D1D',
            color: '#FECACA',
          }}
        >
          {formError}
        </div>
      )}

      <form
        onSubmit={handleAddDriver}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          <Input
            label="Driver Full Name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="e.g. Musa Babangida"
            required
          />
          <Input
            label="Phone Number (WhatsApp Active)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2348012345678"
            required
          />
          <Input
            label="Vehicle Plate Number (Optional)"
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value)}
            placeholder="e.g. KJA-882-XD"
          />
        </div>

        <div style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}>
          <Button type="submit" variant="primary" loading={adding}>
            Generate Join Code & Add Driver
          </Button>
        </div>
      </form>
    </section>
  );
}
