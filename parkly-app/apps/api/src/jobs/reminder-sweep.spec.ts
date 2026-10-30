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
import { markNoShowsJob } from './mark-no-shows.js';
import { reminderSweepJob } from './reminder-sweep.js';

describe('Story 4 Background Jobs: mark-no-shows and sweep-reminders', () => {
  it('markNoShowsJob marks expired confirmed bookings as NO_SHOW and releases space', async () => {
    const store = new MemoryStore();
    const clock = new FakeClock(new Date('2026-10-20T10:00:00Z'));
    const logger = createLogger({ level: 'silent' });

    const driverId = randomUUID();
    const lotId = randomUUID();

    // 1. Expired booking (start 08:00, now 10:00 -> > 30m passed)
    const b1 = {
      id: randomUUID(),
      code: 'PK-EXPIRE1',
      driverId,
      vehicleId: randomUUID(),
      plateNorm: 'ABC123XY',
      lotId,
      ratePlanId: randomUUID(),
      product: 'HOURLY' as const,
      startAt: new Date('2026-10-20T08:00:00Z'),
      endAt: new Date('2026-10-20T11:00:00Z'),
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

    // 2. Fresh booking (start 09:45, now 10:00 -> 15m passed, <= 30m grace)
    const b2 = {
      ...b1,
      id: randomUUID(),
      code: 'PK-FRESH2',
      startAt: new Date('2026-10-20T09:45:00Z'),
      endAt: new Date('2026-10-20T11:45:00Z'),
    };

    store.booking.bookingRows.push(b1, b2);

    const job = markNoShowsJob({
      store,
      logger,
      now: () => clock.now(),
    });

    const result = await job({ payload: {}, deadline: new Date(Date.now() + 10_000) });
    expect(result.processed).toBe(1);
    expect(b1.status).toBe('NO_SHOW');
    expect(b2.status).toBe('CONFIRMED');
  });

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
});
