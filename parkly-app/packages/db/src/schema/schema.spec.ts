import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { ROLES } from '@parkly/domain/authz';
import { BOOKING_STATUSES, PAYMENT_STATUSES } from '@parkly/domain/booking';
import { LOT_STATUSES, VERIFICATION_ITEMS } from '@parkly/domain/lot';
import * as schema from './index.js';

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));

describe('schema conventions (doc 02 §1)', () => {
  it('finds the tables', () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
      'attendant_sync_batches',
      'audit_logs',
      'booking_extensions',
      'booking_status_history',
      'bookings',
      'checkin_events',
      'consents',
      'data_subject_requests',
      'devices',
      'feature_flags',
      'files',
      'idempotency_keys',
      'ledger_accounts',
      'ledger_entries',
      'lot_closures',
      'lot_opening_hours',
      'lot_photos',
      'lot_signing_keys',
      'lot_slot_inventory',
      'lot_walk_ins',
      'lots',
      'notifications',
      'operator_kyb_documents',
      'operator_members',
      'operators',
      'payments',
      'payout_accounts',
      'permits',
      'platform_settings',
      'rate_plans',
      'receipt_counters',
      'receipts',
      'refunds',
      'sessions',
      'user_roles',
      'users',
      'vehicles',
      'verification_items',
      'verification_records',
      'webhook_events',
    ]);
  });

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    '%s enables RLS with an API policy',
    (_name, table) => {
      const config = getTableConfig(table);
      expect(config.enableRLS).toBe(true);
      expect(config.policies.length).toBeGreaterThan(0);
      for (const policy of config.policies) {
        expect(policy.to).toBeDefined();
      }
    },
  );

  // lot_slot_inventory is high-volume and keyed by (lot, slot): no id or timestamps (doc 02 §2.5).
  // webhook_events records when it arrived as received_at (doc 02 §2.7).
  it.each(
    tables
      .filter((t) => !['lot_slot_inventory', 'webhook_events'].includes(getTableConfig(t).name))
      .map((t) => [getTableConfig(t).name, t] as const),
  )('%s has created_at', (_name, table) => {
    expect(getTableConfig(table).columns.map((c) => c.name)).toContain('created_at');
  });
});

describe('enums match the domain (no silent drift)', () => {
  it.each([
    ['lot_status', schema.lotStatusEnum.enumValues, LOT_STATUSES],
    ['verification_item', schema.verificationItemEnum.enumValues, VERIFICATION_ITEMS],
    ['role', schema.roleEnum.enumValues, ROLES],
    ['booking_status', schema.bookingStatusEnum.enumValues, BOOKING_STATUSES],
    ['payment_status', schema.paymentStatusEnum.enumValues, PAYMENT_STATUSES],
  ] as const)('%s', (_name, db, domain) => {
    expect([...db]).toEqual([...domain]);
  });

  it('permit_status is the review statuses plus EXPIRED', () => {
    expect(schema.permitStatusEnum.enumValues).toEqual([
      ...schema.reviewStatusEnum.enumValues,
      'EXPIRED',
    ]);
  });
});

describe('geography point (EWKB)', () => {
  // Captured from PostGIS 3.3: ST_SetSRID(ST_MakePoint(3.4219, 6.4281), 4326)::geography (Victoria Island)
  const viWithSrid = '0101000020E61000008E75711B0D600B409FABADD85FB61940';
  it('reads lng/lat from a point with an SRID', () => {
    const p = schema.parseEwkbPoint(viWithSrid);
    expect(p.lng).toBeCloseTo(3.4219, 4);
    expect(p.lat).toBeCloseTo(6.4281, 4);
  });
  it('reads a big-endian point without an SRID', () => {
    const buf = Buffer.alloc(21);
    buf.writeUInt8(0, 0);
    buf.writeUInt32BE(1, 1);
    buf.writeDoubleBE(3.5, 5);
    buf.writeDoubleBE(6.5, 13);
    expect(schema.parseEwkbPoint(buf.toString('hex'))).toEqual({ lng: 3.5, lat: 6.5 });
  });
  it('rejects anything that is not a point', () => {
    expect(() => schema.parseEwkbPoint('010200000000000000')).toThrow(/Point/);
  });
});
