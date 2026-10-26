import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { FakeEmailProvider, FakePushProvider, FakeSmsProvider } from '../providers/fakes.js';
import { MemoryStore } from '../store/memory.js';
import { NotificationService } from './service.js';
import { renderEmail, renderPush, renderSms } from './templates.js';
import type { NotificationEvent } from './types.js';

describe('Notification Templates', () => {
  const baseEvent: NotificationEvent = {
    key: 'booking.confirmed',
    driverId: randomUUID(),
    bookingId: randomUUID(),
    bookingCode: 'PK-X1Y2Z3',
    lotName: 'Eko Hotel Car Park',
    startAt: '2026-10-20T07:00:00.000Z',
    endAt: '2026-10-20T09:00:00.000Z',
    totalKobo: 110_000,
  };

  it('renders SMS message under 160 characters', () => {
    const sms = renderSms(baseEvent, '+2348012345678');
    expect(sms).not.toBeNull();
    expect(sms?.to).toBe('+2348012345678');
    expect(sms?.body).toContain('PK-X1Y2Z3');
    expect(sms?.body).toContain('Eko Hotel Car Park');
    expect(sms?.body.length).toBeLessThanOrEqual(160);
  });

  it('renders reminder and extension SMS under 160 characters', () => {
    const reminderStart = renderSms(
      {
        key: 'booking.reminder_start',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-ABCDEF',
        lotName: 'Adetokunbo Ademola Lot',
        startAt: '2026-10-20T07:00:00.000Z',
        minutesUntil: 30,
      },
      '+2348012345678',
    );
    expect(reminderStart?.body).toContain('starts in 30 mins');
    expect(reminderStart?.body.length).toBeLessThanOrEqual(160);

    const reminderEnd = renderSms(
      {
        key: 'booking.reminder_end',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-ABCDEF',
        lotName: 'Adetokunbo Ademola Lot',
        endAt: '2026-10-20T09:00:00.000Z',
        minutesLeft: 15,
      },
      '+2348012345678',
    );
    expect(reminderEnd?.body).toContain('ends in 15 mins');
    expect(reminderEnd?.body.length).toBeLessThanOrEqual(160);

    const extended = renderSms(
      {
        key: 'booking.extended',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-ABCDEF',
        lotName: 'Adetokunbo Ademola Lot',
        newEndAt: '2026-10-20T10:00:00.000Z',
        addedMinutes: 60,
      },
      '+2348012345678',
    );
    expect(extended?.body).toContain('extended to');
    expect(extended?.body.length).toBeLessThanOrEqual(160);
  });

  it('renders Push notification with deep links and data', () => {
    const push = renderPush(baseEvent, ['token-1', 'token-2']);
    expect(push).not.toBeNull();
    expect(push?.tokens).toEqual(['token-1', 'token-2']);
    expect(push?.title).toBe('Booking Confirmed');
    expect(push?.body).toContain('PK-X1Y2Z3');
    expect(push?.data?.url).toBe(`parkly://bookings/${baseEvent.bookingId}`);
  });

  it('renders Email message with Parkly styling and links', () => {
    const email = renderEmail(baseEvent, 'driver@example.com');
    expect(email).not.toBeNull();
    expect(email?.to).toBe('driver@example.com');
    expect(email?.subject).toContain('PK-X1Y2Z3');
    expect(email?.html).toContain('Parkly');
    expect(email?.html).toContain('Eko Hotel Car Park');
    expect(email?.html).toContain('₦1,100');
    expect(email?.html).toContain(`https://parkly.ng/bookings/${baseEvent.bookingId}`);
  });

  it('covers all SMS templates and edge cases', () => {
    // cancelled with refund
    const cancelRefund = renderSms(
      {
        key: 'booking.cancelled',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-CAN1',
        lotName: 'Eko Lot',
        refundKobo: 50_000,
      },
      '+2348012345678',
    );
    expect(cancelRefund?.body).toContain('Refund of ₦500 initiated');

    // cancelled without refund
    const cancelNoRefund = renderSms(
      {
        key: 'booking.cancelled',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-CAN2',
        lotName: 'Eko Lot',
        refundKobo: 0,
      },
      '+2348012345678',
    );
    expect(cancelNoRefund?.body).toContain('has been cancelled.');
    expect(cancelNoRefund?.body).not.toContain('Refund');

    // overstay due
    const overstay = renderSms(
      {
        key: 'session.overstay_due',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-OVR',
        lotName: 'Eko Lot',
        overstayMinutes: 45,
        amountKobo: 37_500,
      },
      '+2348012345678',
    );
    expect(overstay?.body).toContain('Unpaid overstay of 45m (₦375)');

    // unknown key
    const unknown = renderSms({ key: 'unknown' } as unknown as NotificationEvent, '+2348012345678');
    expect(unknown).toBeNull();

    // long message truncated
    const longMsg = renderSms(
      {
        ...baseEvent,
        lotName: 'A'.repeat(200),
      },
      '+2348012345678',
    );
    expect(longMsg?.body.length).toBeLessThanOrEqual(160);
    expect(longMsg?.body.endsWith('...')).toBe(true);
  });

  it('covers all Push notification templates and edge cases', () => {
    expect(renderPush(baseEvent, [])).toBeNull();

    const tokens = ['tok-1'];
    // reminder_end
    const remEnd = renderPush(
      {
        key: 'booking.reminder_end',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-REM2',
        lotName: 'Eko Lot',
        endAt: '2026-10-20T09:00:00.000Z',
        minutesLeft: 15,
      },
      tokens,
    );
    expect(remEnd?.title).toBe('Stay Expiring Soon');

    // extended
    const ext = renderPush(
      {
        key: 'booking.extended',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-EXT',
        lotName: 'Eko Lot',
        newEndAt: '2026-10-20T10:00:00.000Z',
        addedMinutes: 60,
      },
      tokens,
    );
    expect(ext?.title).toBe('Stay Extended');

    // cancelled with refund
    const canRef = renderPush(
      {
        key: 'booking.cancelled',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-CAN',
        lotName: 'Eko Lot',
        refundKobo: 50_000,
      },
      tokens,
    );
    expect(canRef?.body).toContain('Refund: ₦500');

    // cancelled without refund
    const canNoRef = renderPush(
      {
        key: 'booking.cancelled',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-CAN',
        lotName: 'Eko Lot',
        refundKobo: 0,
      },
      tokens,
    );
    expect(canNoRef?.body).not.toContain('Refund:');

    // no-show
    const noShow = renderPush(
      {
        key: 'booking.no_show',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-NS',
        lotName: 'Eko Lot',
      },
      tokens,
    );
    expect(noShow?.title).toBe('Booking No-Show');

    // overstay_due
    const overstay = renderPush(
      {
        key: 'session.overstay_due',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-OVR',
        lotName: 'Eko Lot',
        overstayMinutes: 30,
        amountKobo: 25_000,
      },
      tokens,
    );
    expect(overstay?.title).toBe('Overstay Fee Due');

    // checked_in
    const chkIn = renderPush(
      {
        key: 'session.checked_in',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-IN',
        lotName: 'Eko Lot',
        checkInAt: '2026-10-20T07:05:00.000Z',
      },
      tokens,
    );
    expect(chkIn?.title).toBe('Checked In');

    // checked_out
    const chkOut = renderPush(
      {
        key: 'session.checked_out',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-OUT',
        lotName: 'Eko Lot',
        checkOutAt: '2026-10-20T08:55:00.000Z',
      },
      tokens,
    );
    expect(chkOut?.title).toBe('Checked Out');

    // unknown key
    expect(renderPush({ key: 'unknown' } as unknown as NotificationEvent, tokens)).toBeNull();
  });

  it('covers Email templates and edge cases', () => {
    // cancelled with refund
    const canRef = renderEmail(
      {
        key: 'booking.cancelled',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-CAN',
        lotName: 'Eko Lot',
        refundKobo: 50_000,
      },
      'test@example.com',
    );
    expect(canRef?.html).toContain('A refund of ₦500 has been initiated');

    // cancelled without refund
    const canNoRef = renderEmail(
      {
        key: 'booking.cancelled',
        driverId: baseEvent.driverId,
        bookingId: baseEvent.bookingId,
        bookingCode: 'PK-CAN',
        lotName: 'Eko Lot',
        refundKobo: 0,
      },
      'test@example.com',
    );
    expect(canNoRef?.html).toContain('no refund is due for late cancellation');

    // unknown key
    expect(renderEmail({ key: 'unknown' } as unknown as NotificationEvent, 'test@example.com')).toBeNull();
  });
});

describe('NotificationService Dispatcher', () => {
  it('dispatches confirmed booking to Push, SMS, and Email', async () => {
    const store = new MemoryStore();
    const sms = new FakeSmsProvider();
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });

    const driverId = randomUUID();
    store.seedUser(driverId, { roles: [{ role: 'DRIVER', operatorId: null }] });
    // Seed user with plain phone/email for test
    const userRow = store.userRows.get(driverId);
    if (userRow) {
      (userRow as unknown as { phone: string; email: string }).phone = '+2348012345678';
      (userRow as unknown as { phone: string; email: string }).email = 'tunde@example.com';
    }
    // Seed device with push token
    store.deviceRows.push({
      userId: driverId,
      clientDeviceId: 'phone-1',
      platform: 'ANDROID',
      appVersion: '1.0.0',
      authSessionId: randomUUID(),
      pushTokenEnc: 'fcm-push-token-123',
      revokedAt: null,
    });

    const service = new NotificationService({
      sms,
      push,
      email,
      store,
      logger,
    });

    const event: NotificationEvent = {
      key: 'booking.confirmed',
      driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-CONF12',
      lotName: 'Silverbird Lot',
      startAt: '2026-10-20T07:00:00.000Z',
      endAt: '2026-10-20T09:00:00.000Z',
      totalKobo: 110_000,
    };

    const result = await service.dispatch(event);
    expect(result.deliveredChannels).toContain('PUSH');
    expect(result.deliveredChannels).toContain('SMS');
    expect(result.deliveredChannels).toContain('EMAIL');
    expect(sms.sent).toHaveLength(1);
    expect(push.sent).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
  });

  it('falls back to SMS when push delivery fails for reminder_start', async () => {
    const store = new MemoryStore();
    const sms = new FakeSmsProvider();
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });

    const driverId = randomUUID();
    store.seedUser(driverId, { roles: [{ role: 'DRIVER', operatorId: null }] });
    const userRow = store.userRows.get(driverId);
    if (userRow) {
      (userRow as unknown as { phone: string }).phone = '+2348012345678';
    }

    // No push devices registered: push will not be sent
    const service = new NotificationService({
      sms,
      push,
      email,
      store,
      logger,
    });

    const event: NotificationEvent = {
      key: 'booking.reminder_start',
      driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-REMIND',
      lotName: 'Eko Hotel Lot',
      startAt: '2026-10-20T07:00:00.000Z',
      minutesUntil: 30,
    };

    const result = await service.dispatch(event);
    expect(result.deliveredChannels).toContain('SMS');
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.body).toContain('starts in 30 mins');
  });

  it('handles provider errors gracefully without throwing', async () => {
    const store = new MemoryStore();
    const sms = new FakeSmsProvider();
    sms.failNext = true; // force error on next send
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });

    const driverId = randomUUID();
    store.seedUser(driverId, { roles: [{ role: 'DRIVER', operatorId: null }] });
    const userRow = store.userRows.get(driverId);
    if (userRow) {
      (userRow as unknown as { phone: string }).phone = '+2348012345678';
    }

    const service = new NotificationService({
      sms,
      push,
      email,
      store,
      logger,
    });

    const event: NotificationEvent = {
      key: 'booking.extended',
      driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-EXTEND',
      lotName: 'Eko Hotel Lot',
      newEndAt: '2026-10-20T10:00:00.000Z',
      addedMinutes: 60,
    };

    const result = await service.dispatch(event);
    expect(result.failedChannels).toContain('SMS');
  });

  it('handles push provider failure and 0 delivered gracefully', async () => {
    const store = new MemoryStore();
    const sms = new FakeSmsProvider();
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });

    const driverId = randomUUID();
    store.seedUser(driverId, { roles: [{ role: 'DRIVER', operatorId: null }] });
    store.deviceRows.push({
      userId: driverId,
      clientDeviceId: 'phone-fail',
      platform: 'IOS',
      appVersion: '1.0.0',
      authSessionId: randomUUID(),
      pushTokenEnc: 'bad-token',
      revokedAt: null,
    });

    // 1. push fails with exception
    push.failNext = true;
    const service = new NotificationService({ sms, push, email, store, logger });
    const event: NotificationEvent = {
      key: 'booking.confirmed',
      driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-CONF',
      lotName: 'Eko Lot',
      startAt: '2026-10-20T07:00:00.000Z',
      endAt: '2026-10-20T09:00:00.000Z',
      totalKobo: 100_000,
    };
    const res1 = await service.dispatch(event);
    expect(res1.failedChannels).toContain('PUSH');

    // 2. push delivered is 0 because token was marked invalid
    push.invalid.add('bad-token');
    const res2 = await service.dispatch(event);
    expect(res2.failedChannels).toContain('PUSH');

    // 3. email failure
    const userRow = store.userRows.get(driverId);
    if (userRow) {
      (userRow as unknown as { email: string }).email = 'test@example.com';
    }
    email.failNext = true;
    const res3 = await service.dispatch(event);
    expect(res3.failedChannels).toContain('EMAIL');
  });

  it('returns empty channels when user has no contact info or devices', async () => {
    const store = new MemoryStore();
    const sms = new FakeSmsProvider();
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });

    const driverId = randomUUID();
    // User does not exist in store
    const service = new NotificationService({ sms, push, email, store, logger });
    const event: NotificationEvent = {
      key: 'booking.confirmed',
      driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-NOUSER',
      lotName: 'Eko Lot',
      startAt: '2026-10-20T07:00:00.000Z',
      endAt: '2026-10-20T09:00:00.000Z',
      totalKobo: 100_000,
    };
    const res = await service.dispatch(event);
    expect(res.deliveredChannels).toHaveLength(0);
    expect(res.failedChannels).toHaveLength(0);
  });

  it('decrypts phone, email, and device push token when crypto is provided', async () => {
    const store = new MemoryStore();
    const sms = new FakeSmsProvider();
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();
    const logger = createLogger({ level: 'silent' });

    const crypto = {
      encrypt: (s: string) => `enc:${s}`,
      decrypt: (s: string) => {
        if (s.startsWith('bad:')) throw new Error('decryption error');
        return s.replace(/^enc:/, '');
      },
    };

    const driverId = randomUUID();
    store.seedUser(driverId, { roles: [{ role: 'DRIVER', operatorId: null }] });
    const userRow = store.userRows.get(driverId);
    if (userRow) {
      (userRow as unknown as { phoneEnc: string; emailEnc: string }).phoneEnc = 'enc:+2348099887766';
      (userRow as unknown as { phoneEnc: string; emailEnc: string }).emailEnc = 'enc:driver@example.com';
    }
    store.deviceRows.push({
      userId: driverId,
      clientDeviceId: 'phone-enc',
      platform: 'ANDROID',
      appVersion: '1.0.0',
      authSessionId: randomUUID(),
      pushTokenEnc: 'enc:fcm-enc-token',
      revokedAt: null,
    });

    const service = new NotificationService({ sms, push, email, store, logger, crypto });
    const event: NotificationEvent = {
      key: 'booking.confirmed',
      driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-CRYPTO',
      lotName: 'Eko Lot',
      startAt: '2026-10-20T07:00:00.000Z',
      endAt: '2026-10-20T09:00:00.000Z',
      totalKobo: 100_000,
    };
    const res = await service.dispatch(event);
    expect(res.deliveredChannels).toContain('PUSH');
    expect(res.deliveredChannels).toContain('SMS');
    expect(res.deliveredChannels).toContain('EMAIL');
    expect(sms.sent[0]?.to).toBe('+2348099887766');
    expect(email.sent[0]?.to).toBe('driver@example.com');
    expect(push.sent[0]?.tokens).toContain('fcm-enc-token');

    // Test decryption failures gracefully caught
    if (userRow) {
      (userRow as unknown as { phoneEnc: string; emailEnc: string }).phoneEnc = 'bad:phone';
      (userRow as unknown as { phoneEnc: string; emailEnc: string }).emailEnc = 'bad:email';
    }
    store.deviceRows[0]!.pushTokenEnc = 'bad:token';
    const resBad = await service.dispatch(event);
    expect(resBad.deliveredChannels).not.toContain('SMS');
    expect(resBad.deliveredChannels).not.toContain('EMAIL');
  });
});
