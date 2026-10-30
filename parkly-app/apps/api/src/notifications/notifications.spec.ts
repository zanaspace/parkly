import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCrypto } from '../lib/crypto.js';
import { createLogger } from '../lib/logger.js';
import {
  FakeClock,
  FakeEmailProvider,
  FakePushProvider,
  FakeSmsProvider,
} from '../providers/fakes.js';
import { MemoryStore } from '../store/memory.js';
import { NotificationService, quietHoursEnd } from './service.js';
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
    expect(
      renderEmail({ key: 'unknown' } as unknown as NotificationEvent, 'test@example.com'),
    ).toBeNull();
  });
});

describe('NotificationService', () => {
  const crypto = createCrypto({
    encKeys: { v1: randomBytes(32) },
    currentEncVersion: 'v1',
    pepper: 'test-pepper-test-pepper-test-pepper',
  });

  function setup(nowIso = '2026-10-20T08:00:00Z') {
    const store = new MemoryStore();
    const sms = new FakeSmsProvider();
    const push = new FakePushProvider();
    const email = new FakeEmailProvider();
    const clock = new FakeClock(new Date(nowIso));
    const service = new NotificationService({
      sms,
      push,
      email,
      store,
      logger: createLogger({ level: 'silent' }),
      crypto,
      now: () => clock.now(),
    });
    const driverId = randomUUID();
    store.seedUser(driverId, { roles: [{ role: 'DRIVER', operatorId: null }] });
    const withContact = async (contact: { phone?: string; email?: string; push?: string }) => {
      await store.users.setContact(driverId, {
        phoneHash: null,
        emailHash: null,
        phoneEnc: contact.phone ? crypto.encrypt(contact.phone) : null,
        emailEnc: contact.email ? crypto.encrypt(contact.email) : null,
      });
      if (contact.push)
        await store.devices.upsert({
          userId: driverId,
          clientDeviceId: randomUUID(),
          platform: 'ANDROID',
          appVersion: '1.0.0',
          authSessionId: randomUUID(),
          pushTokenEnc: crypto.encrypt(contact.push),
        });
    };
    const confirmed = (bookingId = randomUUID()): NotificationEvent => ({
      key: 'booking.confirmed',
      driverId,
      bookingId,
      bookingCode: 'PK-CONF12',
      lotName: 'Silverbird Lot',
      startAt: '2026-10-20T09:00:00.000Z',
      endAt: '2026-10-20T11:00:00.000Z',
      totalKobo: 110_000,
    });
    const deadline = new Date('2100-01-01T00:00:00Z');
    return { store, sms, push, email, clock, service, driverId, withContact, confirmed, deadline };
  }

  it('sends a confirmation by push, SMS and email to the decrypted contact', async () => {
    const t = setup();
    await t.withContact({ phone: '+2348099887766', email: 'ada@example.com', push: 'expo-tok-1' });
    const res = await t.service.dispatch(t.confirmed());
    expect(res.deliveredChannels.sort()).toEqual(['EMAIL', 'PUSH', 'SMS']);
    expect(t.sms.sent[0]?.to).toBe('+2348099887766');
    expect(t.email.sent[0]?.to).toBe('ada@example.com');
    expect(t.push.sent[0]?.tokens).toEqual(['expo-tok-1']);
  });

  it('sends a reminder by SMS only when push reaches no device (FR-NOT-003)', async () => {
    const t = setup();
    await t.withContact({ phone: '+2348099887766', push: 'expo-tok-1' });
    const reminder: NotificationEvent = {
      key: 'booking.reminder_start',
      driverId: t.driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-REM001',
      lotName: 'Eko Lot',
      startAt: '2026-10-20T09:00:00.000Z',
      minutesUntil: 60,
    };
    expect((await t.service.dispatch(reminder)).deliveredChannels).toEqual(['PUSH']);
    expect(t.sms.sent).toHaveLength(0);

    // The device's token is no longer valid, so push reaches nobody.
    t.push.invalid.add('expo-tok-1');
    const res = await t.service.dispatch(reminder);
    expect(res.deliveredChannels).toEqual(['SMS']);
    // SMS covered it, so the push isn't retried.
    expect(res.failedChannels).toEqual([]);
  });

  it('does not retry push to devices that are no longer registered', async () => {
    const t = setup();
    await t.withContact({ push: 'expo-gone' });
    t.push.invalid.add('expo-gone');
    expect(await t.service.dispatch(t.confirmed())).toEqual({
      deliveredChannels: [],
      failedChannels: [],
    });
    // A provider error is still worth retrying.
    t.push.failNext = true;
    expect((await t.service.dispatch(t.confirmed())).failedChannels).toEqual(['PUSH']);
  });

  it('skips channels it has no address for, and unreadable ciphertext, without throwing', async () => {
    const t = setup();
    expect(await t.service.dispatch(t.confirmed())).toEqual({
      deliveredChannels: [],
      failedChannels: [],
    });
    await t.store.users.setContact(t.driverId, {
      phoneHash: null,
      emailHash: null,
      phoneEnc: 'not-ciphertext',
      emailEnc: 'not-ciphertext',
    });
    expect((await t.service.dispatch(t.confirmed())).deliveredChannels).toEqual([]);
  });

  it('queues an event once per dedupe key and sends it from the delivery job', async () => {
    const t = setup();
    await t.withContact({ phone: '+2348099887766' });
    const event = t.confirmed();
    await t.service.notify(event);
    await t.service.notify(event);
    expect(t.store.outbox.rows).toHaveLength(1);
    expect(t.sms.sent).toHaveLength(0);

    expect(await t.service.deliverDue({ deadline: t.deadline })).toEqual({
      processed: 1,
      remaining: 0,
    });
    expect(t.sms.sent).toHaveLength(1);
    expect(t.store.outbox.rows[0]).toMatchObject({
      status: 'SENT',
      channelsDone: ['SMS'],
      attempts: 1,
    });
    // Nothing left to send.
    expect((await t.service.deliverDue({ deadline: t.deadline })).processed).toBe(0);
  });

  it('retries only the failed channel with backoff, then gives up after 5 attempts', async () => {
    const t = setup();
    await t.withContact({ phone: '+2348099887766', email: 'ada@example.com' });
    t.email.send = () => Promise.reject(new Error('email provider down'));
    await t.service.notify(t.confirmed());

    await t.service.deliverDue({ deadline: t.deadline });
    const row = t.store.outbox.rows[0];
    expect(row).toMatchObject({ status: 'PENDING', channelsDone: ['SMS'], attempts: 1 });
    expect(row?.lastError).toContain('EMAIL');
    // Not due again until the 1-minute backoff passes.
    expect((await t.service.deliverDue({ deadline: t.deadline })).processed).toBe(0);

    for (const minutes of [1, 5, 25, 120]) {
      t.clock.advance(minutes * 60_000);
      expect((await t.service.deliverDue({ deadline: t.deadline })).processed).toBe(1);
    }
    expect(row).toMatchObject({ status: 'FAILED', attempts: 5 });
    // The SMS went once; only the email was retried.
    expect(t.sms.sent).toHaveLength(1);
  });

  it('holds non-critical events until 07:00 Lagos during quiet hours', async () => {
    // 23:30 Lagos = 22:30 UTC.
    const t = setup('2026-10-20T22:30:00Z');
    const checkedOut: NotificationEvent = {
      key: 'session.checked_out',
      driverId: t.driverId,
      bookingId: randomUUID(),
      bookingCode: 'PK-OUT001',
      lotName: 'Eko Lot',
      checkOutAt: '2026-10-20T22:30:00.000Z',
    };
    await t.service.notify(checkedOut);
    expect(t.store.outbox.rows[0]?.nextAttemptAt.toISOString()).toBe('2026-10-21T06:00:00.000Z');
    // Time-bound events go now.
    await t.service.notify(t.confirmed());
    expect(t.store.outbox.rows[1]?.nextAttemptAt.toISOString()).toBe('2026-10-20T22:30:00.000Z');
  });

  it('never throws from notify, so the action that caused it still succeeds', async () => {
    const t = setup();
    t.store.notifications.enqueue = () => Promise.reject(new Error('db down'));
    await expect(t.service.notify(t.confirmed())).resolves.toBeUndefined();
  });
});

describe('quietHoursEnd', () => {
  it('is null by day and the next 07:00 Lagos by night', () => {
    expect(quietHoursEnd(new Date('2026-10-20T12:00:00Z'))).toBeNull();
    // 22:00 Lagos (21:00 UTC) starts quiet hours.
    expect(quietHoursEnd(new Date('2026-10-20T21:00:00Z'))?.toISOString()).toBe(
      '2026-10-21T06:00:00.000Z',
    );
    // 03:00 Lagos the same night.
    expect(quietHoursEnd(new Date('2026-10-21T02:00:00Z'))?.toISOString()).toBe(
      '2026-10-21T06:00:00.000Z',
    );
    // 07:00 Lagos is daytime again.
    expect(quietHoursEnd(new Date('2026-10-21T06:00:00Z'))).toBeNull();
  });
});
