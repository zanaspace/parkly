import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCrypto } from '../lib/crypto.js';
import { createLogger } from '../lib/logger.js';
import { NotificationService } from '../notifications/service.js';
import {
  FakeClock,
  FakeEmailProvider,
  FakePushProvider,
  FakeSmsProvider,
} from '../providers/fakes.js';
import { MemoryStore } from '../store/memory.js';
import { reminderSweepJob } from './reminder-sweep.js';

describe('sweep-reminders job', () => {
  it('reminderSweepJob sweeps for upcoming starts and expiring bookings', async () => {
    const store = new MemoryStore();
    const clock = new FakeClock(new Date('2026-10-20T08:00:00Z'));
    const logger = createLogger({ level: 'silent' });
    const sms = new FakeSmsProvider();
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();

    const crypto = createCrypto({
      encKeys: { v1: randomBytes(32) },
      currentEncVersion: 'v1',
      pepper: 'test-pepper-test-pepper-test-pepper',
    });
    const notifications = new NotificationService({
      sms,
      push,
      email,
      store,
      logger,
      crypto,
      now: () => clock.now(),
    });

    const driverId = randomUUID();
    store.seedUser(driverId, { roles: [{ role: 'DRIVER', operatorId: null }] });
    await store.users.setContact(driverId, {
      phoneHash: null,
      emailHash: null,
      phoneEnc: crypto.encrypt('+2348012345678'),
      emailEnc: null,
    });

    const lotId = randomUUID();
    store.lotRows.set(lotId, {
      id: lotId,
      operatorId: randomUUID(),
      name: 'Victoria Mall Car Park',
      slug: 'victoria-mall',
      description: null,
      addressLine: 'Ahmadu Bello Way',
      area: 'Victoria Island',
      lga: 'Eti-Osa',
      location: { lat: 6.42, lng: 3.42 },
      entranceNotes: null,
      capacityTotal: 50,
      capacityBookable: 20,
      amenities: [],
      vehicleTypes: ['CAR'],
      type: 'HOTEL',
      status: 'LIVE',
      statusReason: null,
      selfCheckinEnabled: false,
      version: 1,
      createdAt: new Date(),
    });

    // Booking 1: starts in 30 minutes (08:30), inside the 60-minute window -> reminder_start
    const bStart = {
      id: randomUUID(),
      code: 'PK-START30',
      driverId,
      vehicleId: randomUUID(),
      plateNorm: 'ABC123XY',
      lotId,
      ratePlanId: randomUUID(),
      product: 'HOURLY' as const,
      startAt: new Date('2026-10-20T08:30:00Z'),
      endAt: new Date('2026-10-20T10:30:00Z'),
      status: 'CONFIRMED' as const,
      holdExpiresAt: null,
      priceKobo: 100_000,
      serviceFeeKobo: 10_000,
      totalKobo: 110_000,
      commissionBps: 1200,
      pricingBreakdown: null,
      source: 'MOBILE' as const,
      version: 1,
      createdAt: new Date('2026-10-20T07:00:00Z'),
    };

    // Booking 2: ends in 15 minutes (08:15) -> should trigger reminder_end
    const bEnd = {
      ...bStart,
      id: randomUUID(),
      code: 'PK-END15',
      startAt: new Date('2026-10-20T06:15:00Z'),
      endAt: new Date('2026-10-20T08:15:00Z'),
      status: 'CONFIRMED' as const,
    };

    // Booking 3: starts in 90 minutes, outside the window -> nothing yet
    const bLater = {
      ...bStart,
      id: randomUUID(),
      code: 'PK-LATER9',
      startAt: new Date('2026-10-20T09:30:00Z'),
      endAt: new Date('2026-10-20T11:30:00Z'),
    };

    store.booking.bookingRows.push(bStart, bEnd, bLater);

    const job = reminderSweepJob({ store, notifications, now: () => clock.now() });
    const deadline = new Date('2100-01-01T00:00:00Z');

    // The sweep only queues; nothing is sent until the delivery job runs.
    const res1 = await job({ payload: {}, deadline });
    expect(res1.processed).toBe(2);
    expect(sms.sent).toHaveLength(0);
    expect(store.outbox.rows.map((r) => r.dedupeKey).sort()).toEqual(
      [`booking.reminder_end:${bEnd.id}`, `booking.reminder_start:${bStart.id}`].sort(),
    );

    await notifications.deliverDue({ deadline });
    // No push token registered, so SMS is the fallback.
    expect(sms.sent.map((m) => m.body).join(' | ')).toContain('starts in 30 mins');
    expect(sms.sent.map((m) => m.body).join(' | ')).toContain('ends in 15 mins');
    expect(store.outbox.rows.every((r) => r.status === 'SENT')).toBe(true);

    // Rerunning queues nothing new: one reminder per booking.
    expect((await job({ payload: {}, deadline })).processed).toBe(0);

    // Thirty minutes later the third booking enters the window.
    clock.advance(30 * 60_000);
    expect((await job({ payload: {}, deadline })).processed).toBe(1);
  });

  it('tells the driver once about a booking the database marked as a no-show', async () => {
    const store = new MemoryStore();
    const clock = new FakeClock(new Date('2026-10-20T08:00:00Z'));
    const crypto = createCrypto({
      encKeys: { v1: randomBytes(32) },
      currentEncVersion: 'v1',
      pepper: 'test-pepper-test-pepper-test-pepper',
    });
    const notifications = new NotificationService({
      sms: new FakeSmsProvider(),
      push: new FakePushProvider(),
      email: new FakeEmailProvider(),
      store,
      logger: createLogger({ level: 'silent' }),
      crypto,
      now: () => clock.now(),
    });
    const lotId = randomUUID();
    store.lotRows.set(lotId, { name: 'Eko Lot' } as never);
    const base = {
      driverId: randomUUID(),
      vehicleId: randomUUID(),
      plateNorm: 'ABC123XY',
      lotId,
      ratePlanId: randomUUID(),
      product: 'HOURLY' as const,
      holdExpiresAt: null,
      priceKobo: 100_000,
      serviceFeeKobo: 10_000,
      totalKobo: 110_000,
      commissionBps: 1200,
      pricingBreakdown: null,
      source: 'MOBILE' as const,
      version: 1,
      createdAt: new Date('2026-10-19T07:00:00Z'),
    };
    // Marked NO_SHOW by fn_mark_no_shows (pg_cron) after the 30-minute grace.
    const missed = {
      ...base,
      id: randomUUID(),
      code: 'PK-MISS01',
      startAt: new Date('2026-10-20T07:00:00Z'),
      endAt: new Date('2026-10-20T09:00:00Z'),
      status: 'NO_SHOW' as const,
    };
    // A no-show from days ago is not announced now.
    const old = {
      ...missed,
      id: randomUUID(),
      code: 'PK-OLD001',
      startAt: new Date('2026-10-17T07:00:00Z'),
      endAt: new Date('2026-10-17T09:00:00Z'),
    };
    store.booking.bookingRows.push(missed, old);

    const job = reminderSweepJob({ store, notifications, now: () => clock.now() });
    const deadline = new Date('2100-01-01T00:00:00Z');
    expect((await job({ payload: {}, deadline })).processed).toBe(1);
    expect(store.outbox.rows.map((r) => r.dedupeKey)).toEqual([`booking.no_show:${missed.id}`]);
    expect((await job({ payload: {}, deadline })).processed).toBe(0);
  });
});
